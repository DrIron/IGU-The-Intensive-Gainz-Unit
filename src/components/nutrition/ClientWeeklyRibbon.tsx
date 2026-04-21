import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Scale, Footprints, ClipboardCheck } from "lucide-react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { cn } from "@/lib/utils";

/**
 * Summary ribbon shown at the top of /nutrition-client. Answers "what's
 * left for me this week?" before the client decides to scroll into the
 * input forms below.
 *
 * Three signals:
 *   - Weigh-ins: goal is 3 per week (client-logged weight_logs count).
 *   - Step days: goal is 7 (one step_logs row per day).
 *   - Weekly check-in: present if an adherence_logs row exists for this week.
 *
 * Dots on each tile show daily progress toward the goal. Click nothing --
 * this is a read-only status bar; the inputs live below.
 */
interface ClientWeeklyRibbonProps {
  userId: string;
  phaseId: string | null;
  /** Current phase week number (1-based). */
  weekNumber: number;
}

interface WeeklyCounts {
  weighIns: number;
  stepDays: number;
  checkInDone: boolean;
}

export function ClientWeeklyRibbon({ userId, phaseId, weekNumber }: ClientWeeklyRibbonProps) {
  const [counts, setCounts] = useState<WeeklyCounts>({ weighIns: 0, stepDays: 0, checkInDone: false });
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");
      const weekEnd = format(endOfWeek(new Date(), { weekStartsOn: 0 }), "yyyy-MM-dd");

      const weighInsQuery = phaseId
        ? supabase
            .from("weight_logs")
            .select("id")
            .eq("phase_id", phaseId)
            .gte("log_date", weekStart)
            .lte("log_date", weekEnd)
        : Promise.resolve({ data: [] });

      const checkInQuery = phaseId
        ? supabase
            .from("adherence_logs")
            .select("id")
            .eq("phase_id", phaseId)
            .eq("week_number", weekNumber)
            .maybeSingle()
        : Promise.resolve({ data: null });

      const [weighInsRes, stepsRes, checkInRes] = await Promise.all([
        weighInsQuery,
        supabase
          .from("step_logs")
          .select("log_date")
          .eq("user_id", userId)
          .gte("log_date", weekStart)
          .lte("log_date", weekEnd),
        checkInQuery,
      ]);

      const weighIns = ((weighInsRes as { data: { id: string }[] | null }).data ?? []).length;
      const uniqueStepDays = new Set(((stepsRes.data as { log_date: string }[] | null) ?? []).map((r) => r.log_date)).size;
      const checkInDone = !!(checkInRes as { data: { id: string } | null }).data;

      setCounts({ weighIns, stepDays: uniqueStepDays, checkInDone });
    } catch (err) {
      console.error("[ClientWeeklyRibbon] load:", err);
    } finally {
      setLoading(false);
    }
  }, [userId, phaseId, weekNumber]);

  useEffect(() => {
    const key = `${userId}:${phaseId}:${weekNumber}`;
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    load();
  }, [userId, phaseId, weekNumber, load]);

  return (
    <div className="grid grid-cols-3 gap-2">
      <Tile
        icon={<Scale className="h-4 w-4" />}
        label="Weigh-ins"
        value={`${counts.weighIns}/3`}
        dots={[...Array(3)].map((_, i) => i < counts.weighIns)}
        done={counts.weighIns >= 3}
        loading={loading}
      />
      <Tile
        icon={<Footprints className="h-4 w-4" />}
        label="Step days"
        value={`${counts.stepDays}/7`}
        dots={[...Array(7)].map((_, i) => i < counts.stepDays)}
        done={counts.stepDays >= 7}
        loading={loading}
      />
      <Tile
        icon={<ClipboardCheck className="h-4 w-4" />}
        label="Check-in"
        value={counts.checkInDone ? "Done" : "Due"}
        dots={[counts.checkInDone]}
        done={counts.checkInDone}
        loading={loading}
      />
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  dots,
  done,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dots: boolean[];
  done: boolean;
  loading: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        done ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wider font-mono">
          {icon}
          {label}
        </span>
        <span className={cn("text-sm font-mono tabular-nums", done && "text-emerald-600 dark:text-emerald-400")}>
          {loading ? "-- " : value}
        </span>
      </div>
      <div className="flex items-center gap-1">
        {dots.map((filled, i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 rounded-full flex-1",
              filled ? (done ? "bg-emerald-500" : "bg-primary") : "bg-muted",
            )}
            aria-hidden
          />
        ))}
      </div>
    </div>
  );
}
