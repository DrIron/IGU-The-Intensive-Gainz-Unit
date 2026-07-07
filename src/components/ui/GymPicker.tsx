import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useGyms } from "@/hooks/useGyms";

interface GymPickerProps {
  /** The coach's user id (= coaches.user_id / coach_gyms.coach_user_id). */
  coachUserId: string;
  disabled?: boolean;
}

/**
 * "Gyms I train at" multi-select for the coach profile — modeled on
 * SpecializationTagPicker, but persists directly to the coach_gyms join table
 * (each toggle inserts/deletes one row, optimistic with rollback). Only
 * meaningful for coaches who do in-person/hybrid; online-only coaches select none.
 * Powers the onboarding "Trains at your gym" match.
 */
export function GymPicker({ coachUserId, disabled = false }: GymPickerProps) {
  const { gyms, loading: gymsLoading } = useGyms();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selLoading, setSelLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  useEffect(() => {
    if (!coachUserId || hasFetched.current === coachUserId) return;
    hasFetched.current = coachUserId;
    supabase
      .from("coach_gyms")
      .select("gym_id")
      .eq("coach_user_id", coachUserId)
      .then(({ data, error }) => {
        if (error) console.warn("[GymPicker] load:", error.message);
        setSelected(new Set((data ?? []).map((r) => r.gym_id)));
        setSelLoading(false);
      });
  }, [coachUserId]);

  const toggle = async (gymId: string) => {
    if (disabled) return;
    const wasSelected = selected.has(gymId);
    setSelected((prev) => {
      const next = new Set(prev);
      if (wasSelected) next.delete(gymId);
      else next.add(gymId);
      return next;
    });

    const { error } = wasSelected
      ? await supabase.from("coach_gyms").delete().eq("coach_user_id", coachUserId).eq("gym_id", gymId)
      : await supabase.from("coach_gyms").insert({ coach_user_id: coachUserId, gym_id: gymId });

    if (error) {
      toast.error("Couldn't update your gyms — please try again.");
      setSelected((prev) => {
        const next = new Set(prev);
        if (wasSelected) next.add(gymId);
        else next.delete(gymId);
        return next;
      });
    }
  };

  if (gymsLoading || selLoading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading gyms...</span>
      </div>
    );
  }

  if (gyms.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">No gyms available yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {gyms.map((gym) => {
          const isSelected = selected.has(gym.id);
          return (
            <button
              key={gym.id}
              type="button"
              onClick={() => toggle(gym.id)}
              disabled={disabled}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-primary/50 cursor-pointer",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              {isSelected && <span>✓</span>}
              {gym.name}
              {gym.area && <span className="opacity-70">· {gym.area}</span>}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">{selected.size} selected</p>
    </div>
  );
}
