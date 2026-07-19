import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useExerciseTaxonomy } from "@/hooks/useExerciseTaxonomy";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerScrollArea,
} from "@/components/ui/drawer";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getYouTubeId } from "@/lib/youtube";
import { equipmentLabel } from "@/lib/equipmentLabels";
import { getExerciseDisplayName } from "@/lib/exerciseDisplay";
import { MuscleMap } from "./MuscleMap";
import {
  Dumbbell,
  Layers,
  MoveHorizontal,
  ArrowLeftRight,
  Shuffle,
  Plus,
  Sparkles,
} from "lucide-react";

/**
 * ExerciseDemoCard — the ONE shared exercise demo surface (library detail · in-session ·
 * swap · coach picker). Slice 1 of the exercise-library epic.
 *
 * ── Honesty (non-negotiable) ────────────────────────────────────────────────
 * Client/in-session/swap surfaces show the friendly `client_name ?? name`; only `coach` context
 * exposes the dense internal `name`. Missing media / setup is a BRANDED "coming soon" block, never a
 * broken empty and never fabricated content. There is no `animation_url` in the DB, so the Animation
 * half of the media toggle is a disabled "coming soon" (we don't bind to a field that doesn't exist).
 * MuscleMap draws no silhouette. No invented last set.
 */

export interface ExerciseDemoData {
  name: string;
  client_name?: string | null;
  /** Canonical PRIMARY muscle FK — resolved to a display_name via the taxonomy. Canonical rebuild
   *  populates this while leaving `primary_muscle` text NULL. */
  muscle_id?: string | null;
  /** Canonical subdivision FK — an optional qualifier on the primary chip ("Pec Major · Costal Head"). */
  subdivision_id?: string | null;
  /** Legacy PRIMARY muscle text — fallback when no `muscle_id`. NULL for canonical rows. */
  primary_muscle?: string | null;
  /** Legacy SECONDARY muscle text — no FK exists for secondaries; often empty on canonical rows. */
  secondary_muscles?: string[] | null;
  equipment?: string | null;
  resistance_profiles?: string[] | null;
  laterality?: string | null;
  positioning?: string | null;
  grip?: string | null;
  setup_points?: string[] | null;
  setup_instructions?: string | null;
  description?: string | null;
  default_video_url?: string | null;
  /** Future portrait anatomy still for the MuscleMap slot; null today. */
  muscleRenderUrl?: string | null;
}

export interface ExerciseDemoLastSet {
  weight: number;
  reps: number;
  unit?: string;
}

export type ExerciseDemoContext = "library" | "in-session" | "swap" | "coach";

export interface ExerciseDemoCardProps {
  exercise: ExerciseDemoData;
  context: ExerciseDemoContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** in-session only — the client's most recent set of this movement. */
  lastSet?: ExerciseDemoLastSet | null;
  onSwap?: () => void;
  onFindSimilar?: () => void;
  onAddAlternative?: () => void;
}

function displayName(ex: ExerciseDemoData): string {
  return ex.client_name?.trim() ? ex.client_name : ex.name;
}

interface MuscleMapTaxonomy {
  muscles: { id: string; display_name: string }[];
  subdivisions: { id: string; display_name: string }[];
}

/**
 * PRIMARY muscle label for the MuscleMap. Canonical exercises carry the muscle in the `muscle_id`
 * FK (the legacy `primary_muscle` text is NULL for them) — resolve it via the taxonomy, optionally
 * qualified by its subdivision ("Pec Major · Costal Head"). Fall back to the legacy `primary_muscle`
 * text for older rows, then null. Returns null ONLY when neither an FK muscle nor legacy text exists
 * (the one case MuscleMap renders "Not specified"). There is no FK for secondaries — those keep
 * reading `secondary_muscles` text.
 */
export function derivePrimaryMuscle(
  exercise: Pick<ExerciseDemoData, "muscle_id" | "subdivision_id" | "primary_muscle">,
  taxonomy?: Partial<MuscleMapTaxonomy> | null,
): string | null {
  if (exercise.muscle_id && taxonomy?.muscles) {
    const muscle = taxonomy.muscles.find((m) => m.id === exercise.muscle_id);
    if (muscle) {
      const sub = exercise.subdivision_id
        ? taxonomy.subdivisions?.find((s) => s.id === exercise.subdivision_id)
        : undefined;
      return sub ? `${muscle.display_name} · ${sub.display_name}` : muscle.display_name;
    }
  }
  return exercise.primary_muscle?.trim() || null;
}

/** Numbered setup steps: explicit points, else the newline-split fallback. */
function setupSteps(ex: ExerciseDemoData): string[] {
  if (ex.setup_points && ex.setup_points.length > 0) return ex.setup_points;
  if (ex.setup_instructions) {
    return ex.setup_instructions
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

const PENDING = "rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center";

function MediaBlock({ exercise }: { exercise: ExerciseDemoData }) {
  // Animation is a real future mode but has no column yet → the toggle shows it as disabled
  // "coming soon". Only Video is live, so the media area always renders the video/pending state.
  const [tab, setTab] = useState<"video" | "animation">("video");
  const videoId = getYouTubeId(exercise.default_video_url);
  const title = displayName(exercise);

  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setTab("video")}
          className={cn(
            "rounded-md px-3 py-1 font-medium transition-colors",
            tab === "video" ? "bg-secondary" : "text-muted-foreground",
          )}
        >
          Video
        </button>
        <button
          type="button"
          disabled
          title="Coming soon"
          className="inline-flex cursor-not-allowed items-center gap-1 rounded-md px-3 py-1 text-muted-foreground/50"
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          Animation
        </button>
      </div>

      {videoId ? (
        <div className="aspect-video overflow-hidden rounded-lg bg-black">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}?rel=0`}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title={title}
          />
        </div>
      ) : (
        // Branded pending — a clean framed block, never a broken empty or an emoji.
        <div className={cn(PENDING, "flex aspect-video flex-col items-center justify-center gap-1.5")}>
          <Sparkles className="h-5 w-5 text-primary/50" aria-hidden />
          <p className="text-sm font-medium text-muted-foreground">Demo video coming soon</p>
        </div>
      )}
    </div>
  );
}

function MetaChips({ exercise }: { exercise: ExerciseDemoData }) {
  const equip = equipmentLabel(exercise.equipment);
  const resistances = (exercise.resistance_profiles ?? []).filter(Boolean);
  const laterality = exercise.laterality
    ? exercise.laterality === "bi"
      ? "Bilateral"
      : "Unilateral"
    : null;

  const chip = (key: string, icon: React.ReactNode, text: string, tone: string) => (
    <span
      key={key}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        tone,
      )}
    >
      {icon}
      {text}
    </span>
  );

  return (
    <div className="flex flex-wrap gap-1.5">
      {equip && chip("equip", <Dumbbell className="h-3 w-3" aria-hidden />, equip, "bg-secondary text-secondary-foreground")}
      {resistances.map((r) =>
        chip(`res-${r}`, <Layers className="h-3 w-3" aria-hidden />, r, "bg-accent/10 text-accent"),
      )}
      {laterality &&
        chip("lat", <MoveHorizontal className="h-3 w-3" aria-hidden />, laterality, "bg-muted text-muted-foreground")}
    </div>
  );
}

function SetupExecution({ exercise }: { exercise: ExerciseDemoData }) {
  const [tab, setTab] = useState<"setup" | "execution">("setup");
  const steps = setupSteps(exercise);
  const execution = exercise.description?.trim() || "";
  const hasAny = steps.length > 0 || !!execution;

  if (!hasAny) {
    return <div className={PENDING}><p className="text-sm text-muted-foreground">Setup &amp; execution coming soon</p></div>;
  }

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
        {(["setup", "execution"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-3 py-1 font-medium capitalize transition-colors",
              tab === t ? "bg-secondary" : "text-muted-foreground",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "setup" ? (
        steps.length > 0 ? (
          <ol className="space-y-1.5">
            {steps.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="shrink-0 font-mono text-status-ontrack">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className={PENDING}><p className="text-sm text-muted-foreground">Setup coming soon</p></div>
        )
      ) : execution ? (
        <p className="whitespace-pre-line text-sm text-muted-foreground">{execution}</p>
      ) : (
        <div className={PENDING}><p className="text-sm text-muted-foreground">Execution coming soon</p></div>
      )}
    </div>
  );
}

/** The card blocks, shell-agnostic. Exported for unit tests (drives the honesty + context logic). */
export function ExerciseDemoContent({
  exercise,
  context,
  primaryMuscle,
  lastSet,
  onSwap,
  onFindSimilar,
  onAddAlternative,
}: Pick<ExerciseDemoCardProps, "exercise" | "context" | "lastSet" | "onSwap" | "onFindSimilar" | "onAddAlternative"> & {
  /** Resolved PRIMARY muscle label (FK → display_name) from the card shell. Omitted → legacy text. */
  primaryMuscle?: string | null;
}) {
  // Coach detail headlines the dense `name` (with `client_name` as the subline); every client-facing
  // context headlines the friendly `client_name ?? name`.
  const headline = getExerciseDisplayName(exercise, context === "coach" ? "coach" : "client");

  // Context CTA. Only rendered when its handler is supplied.
  const cta =
    context === "library" && onFindSimilar
      ? { label: "Find similar", icon: <Shuffle className="h-4 w-4" aria-hidden />, onClick: onFindSimilar }
      : context === "in-session" && onSwap
        ? { label: "Swap", icon: <ArrowLeftRight className="h-4 w-4" aria-hidden />, onClick: onSwap }
        : context === "swap" && onSwap
          ? { label: "Swap this in", icon: <ArrowLeftRight className="h-4 w-4" aria-hidden />, onClick: onSwap }
          : context === "coach" && onAddAlternative
            ? { label: "Add as alternative", icon: <Plus className="h-4 w-4" aria-hidden />, onClick: onAddAlternative }
            : null;

  return (
    <div className="space-y-5">
      {/* Headline — coach sees the dense `name` with the friendly `client_name` as a subline;
          client-facing contexts headline the friendly name. Descriptor detail is coach-only. */}
      <div>
        <h2 className="text-lg font-semibold leading-tight">{headline}</h2>
        {context === "coach" && (
          <>
            {exercise.client_name?.trim() && (
              <p className="mt-0.5 text-xs text-muted-foreground">{exercise.client_name}</p>
            )}
            {(exercise.resistance_profiles?.length || exercise.positioning || exercise.grip) && (
              <p className="mt-1 text-xs text-muted-foreground">
                {[
                  (exercise.resistance_profiles ?? []).join(" / ") || null,
                  exercise.positioning || null,
                  exercise.grip || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </>
        )}
      </div>

      <MediaBlock exercise={exercise} />

      <MuscleMap
        // FK-derived label when the shell resolved one; else legacy `primary_muscle` text.
        primary={primaryMuscle === undefined ? exercise.primary_muscle : primaryMuscle}
        secondary={exercise.secondary_muscles}
        renderUrl={exercise.muscleRenderUrl ?? null}
      />

      <MetaChips exercise={exercise} />

      {context === "in-session" && lastSet && (
        <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">Your last set</p>
          <p className="mt-0.5 text-sm font-medium" data-last-set>
            {lastSet.weight}
            {lastSet.unit ?? "kg"} × {lastSet.reps}
          </p>
        </div>
      )}

      <SetupExecution exercise={exercise} />

      {cta && (
        <Button variant="secondary" className="w-full gap-2" onClick={cta.onClick}>
          {cta.icon}
          {cta.label}
        </Button>
      )}
    </div>
  );
}

export function ExerciseDemoCard({ exercise, context, open, onOpenChange, ...rest }: ExerciseDemoCardProps) {
  const isMobile = useIsMobile();
  // The card owns muscle resolution (single source): canonical rows carry the muscle in the
  // `muscle_id` FK, resolved here to a display_name via the shared taxonomy (already warm on every
  // surface). MuscleMap keeps its simple string prop.
  const { data: taxonomy } = useExerciseTaxonomy();
  const primaryMuscle = useMemo(() => derivePrimaryMuscle(exercise, taxonomy), [exercise, taxonomy]);
  // In-session stays the bottom-sheet Drawer it is today; library/coach/swap use a Dialog on
  // desktop and a Drawer on mobile.
  const asDrawer = context === "in-session" || isMobile;
  // sr-only sheet title mirrors the visible headline's audience.
  const title = getExerciseDisplayName(exercise, context === "coach" ? "coach" : "client");
  const content = (
    <ExerciseDemoContent exercise={exercise} context={context} primaryMuscle={primaryMuscle} {...rest} />
  );

  if (asDrawer) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="flex max-h-[90dvh] flex-col">
          {/* Accessible title for the sheet; the visible headline lives in the content. */}
          <DrawerTitle className="sr-only">{title}</DrawerTitle>
          <DrawerScrollArea className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            {content}
          </DrawerScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="overflow-y-auto px-1 py-1">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
