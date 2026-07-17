import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Loader2, ArrowLeftRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerScrollArea,
  DrawerTitle,
} from "@/components/ui/drawer";

/** Shape returned by the get_substitute_exercises RPC (jsonb). */
interface Substitute {
  id: string;
  name: string;
  equipment: string | null;
  primary_muscle: string | null;
  resistance_profiles: string[] | null;
  cardio_movement_id: string | null;
  technique_id: string | null;
  target_region_id: string | null;
  match: "exact" | "close";
}

interface SubstituteResult {
  source: { id: string; name: string; category: string };
  substitutes: Substitute[];
}

interface SwapExerciseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Library id of the exercise currently placed (source for substitutes). */
  exerciseId: string | null;
  /** Display name of the current exercise (for the dialog header). */
  exerciseName?: string;
  /** Called with the chosen substitute's library id + name. Omit in viewOnly mode. */
  onSelectSubstitute?: (substituteId: string, substituteName: string) => void;
  /**
   * Read-only mode: substitutes are listed for viewing only (no selection,
   * no program edit). Used on the client-facing library "Find similar".
   */
  viewOnly?: boolean;
}

export function SwapExerciseDialog({
  open,
  onOpenChange,
  exerciseId,
  exerciseName,
  onSelectSubstitute,
  viewOnly = false,
}: SwapExerciseDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubstituteResult | null>(null);
  // The RPC returns the dense `name`; resolve the friendly client_name per id so the rows show it
  // (client_name ?? name). Client-side lookup — no RPC change.
  const [clientNames, setClientNames] = useState<Record<string, string | null>>({});

  const loadSubstitutes = useCallback(async () => {
    if (!exerciseId) return;
    setLoading(true);
    setResult(null);
    setClientNames({});
    try {
      const { data, error } = await supabase.rpc("get_substitute_exercises", {
        p_exercise_id: exerciseId,
      });
      if (error) throw error;
      const parsed = (data as unknown as SubstituteResult) ?? null;
      setResult(parsed);

      const ids = (parsed?.substitutes ?? []).map((s) => s.id);
      if (ids.length > 0) {
        const { data: names } = await supabase
          .from("exercise_library")
          .select("id, client_name")
          .in("id", ids);
        setClientNames(Object.fromEntries((names ?? []).map((n) => [n.id, n.client_name])));
      }
    } catch (error: unknown) {
      toast({
        title: "Couldn't find alternatives",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [exerciseId, toast]);

  // Fetch each time the dialog opens for a (new) exercise.
  useEffect(() => {
    if (open && exerciseId) {
      loadSubstitutes();
    }
    if (!open) {
      setResult(null);
    }
  }, [open, exerciseId, loadSubstitutes]);

  const handlePick = useCallback(
    (sub: Substitute) => {
      if (viewOnly) return;
      onSelectSubstitute?.(sub.id, sub.name);
      onOpenChange(false);
    },
    [viewOnly, onSelectSubstitute, onOpenChange]
  );

  const exact = (result?.substitutes ?? []).filter((s) => s.match === "exact");
  const close = (result?.substitutes ?? []).filter((s) => s.match === "close");

  const cardInner = (sub: Substitute) => (
    <CardContent className="p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{clientNames[sub.id] ?? sub.name}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {sub.primary_muscle && (
              <span className="text-xs text-muted-foreground capitalize">{sub.primary_muscle}</span>
            )}
            {sub.equipment && (
              <span className="text-xs text-muted-foreground">• {sub.equipment}</span>
            )}
          </div>
        </div>
        <Badge
          variant={sub.match === "exact" ? "default" : "secondary"}
          className="text-[10px] shrink-0 capitalize"
        >
          {sub.match}
        </Badge>
      </div>
    </CardContent>
  );

  const renderCard = (sub: Substitute) =>
    viewOnly ? (
      <Card key={sub.id} className="border">
        {cardInner(sub)}
      </Card>
    ) : (
      <ClickableCard
        key={sub.id}
        ariaLabel={`Swap to ${sub.name}`}
        onClick={() => handlePick(sub)}
        className="border"
      >
        {cardInner(sub)}
      </ClickableCard>
    );

  const body = (
    <DrawerScrollArea className={isMobile ? "flex-1 min-h-0" : "max-h-[55vh]"}>
      {loading ? (
        <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Finding alternatives...</span>
        </div>
      ) : !result || result.substitutes.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <span className="text-muted-foreground text-sm">No alternatives found for this exercise.</span>
        </div>
      ) : (
        <div className="space-y-4 pr-1">
          {exact.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Exact match ({exact.length})
              </h4>
              <div className="space-y-2">{exact.map(renderCard)}</div>
            </div>
          )}
          {close.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Close match ({close.length})
              </h4>
              <div className="space-y-2">{close.map(renderCard)}</div>
            </div>
          )}
        </div>
      )}
    </DrawerScrollArea>
  );

  const title = (
    <span className="flex items-center gap-2">
      <ArrowLeftRight className="h-4 w-4" />
      {viewOnly ? "Similar exercises" : "Swap exercise"}
    </span>
  );
  const description = exerciseName
    ? viewOnly
      ? `Alternatives similar to "${exerciseName}".`
      : `Find an alternative for "${exerciseName}".`
    : viewOnly
    ? "Similar exercises."
    : "Find an alternative exercise.";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left px-4 pt-4 pb-2">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col flex-1 min-h-0 px-4 pb-[calc(env(safe-area-inset-bottom,0)+1rem)] overflow-hidden">
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}
