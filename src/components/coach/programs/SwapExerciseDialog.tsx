import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { useExerciseTaxonomy } from "@/hooks/useExerciseTaxonomy";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { getExerciseDisplayName, type ExerciseNameAudience } from "@/lib/exerciseDisplay";
import {
  bucketByTier,
  TIER_ORDER,
  TIER_META,
  type MatchTier,
  type SubstituteExercise,
  type SubstituteResult,
} from "@/lib/substituteMatch";
import { MatchChips, MatchTierBadge } from "@/components/exercise/MatchIndicators";
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
  /** Which label column headlines a substitute row (see lib/exerciseDisplay). Defaults to the
   *  client-facing "Find similar" use; the coach program editor passes "coach". */
  audience?: ExerciseNameAudience;
}

export function SwapExerciseDialog({
  open,
  onOpenChange,
  exerciseId,
  exerciseName,
  onSelectSubstitute,
  viewOnly = false,
  audience = "client",
}: SwapExerciseDialogProps) {
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const { data: taxonomy } = useExerciseTaxonomy();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SubstituteResult | null>(null);
  // The RPC returns the dense `name`; resolve the friendly client_name per id so the rows can
  // headline the audience-appropriate label (see subLabel). Client-side lookup — no RPC change.
  const [clientNames, setClientNames] = useState<Record<string, string | null>>({});

  // subdivision_id → display name, for the "why it matches" subdivision chip.
  const subName = useMemo(
    () => new Map((taxonomy?.subdivisions ?? []).map((s) => [s.id, s.display_name])),
    [taxonomy],
  );

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
    (sub: SubstituteExercise) => {
      if (viewOnly) return;
      onSelectSubstitute?.(sub.id, sub.name);
      onOpenChange(false);
    },
    [viewOnly, onSelectSubstitute, onOpenChange]
  );

  // Weighted RPC returns rows already sorted by score desc — bucket by tier, keep within-tier order.
  const buckets = bucketByTier(result?.substitutes ?? []);

  const subLabel = (sub: SubstituteExercise) =>
    getExerciseDisplayName({ name: sub.name, client_name: clientNames[sub.id] ?? null }, audience);

  const cardInner = (sub: SubstituteExercise, tier: MatchTier) => (
    <CardContent className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{subLabel(sub)}</div>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {sub.primary_muscle && (
              <span className="text-xs text-muted-foreground capitalize">{sub.primary_muscle}</span>
            )}
            {sub.equipment && (
              <span className="text-xs text-muted-foreground">• {sub.equipment}</span>
            )}
          </div>
          <div className="mt-1.5">
            <MatchChips
              dimensions={sub.matched_dimensions}
              equipment={sub.equipment}
              subdivisionName={sub.subdivision_id ? subName.get(sub.subdivision_id) : null}
            />
          </div>
        </div>
        <MatchTierBadge tier={tier} />
      </div>
    </CardContent>
  );

  const renderCard = (sub: SubstituteExercise, tier: MatchTier) =>
    viewOnly ? (
      <Card key={sub.id} className="border">
        {cardInner(sub, tier)}
      </Card>
    ) : (
      <ClickableCard
        key={sub.id}
        ariaLabel={`Swap to ${subLabel(sub)}`}
        onClick={() => handlePick(sub)}
        className="border"
      >
        {cardInner(sub, tier)}
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
          {TIER_ORDER.filter((tier) => buckets[tier].length > 0).map((tier) => (
            <div key={tier} className="space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {TIER_META[tier].section} ({buckets[tier].length})
              </h4>
              <div className="space-y-2">{buckets[tier].map((sub) => renderCard(sub, tier))}</div>
            </div>
          ))}
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
