import { useMemo } from "react";
import { ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MuscleDistributionRibbon } from "../shared/MuscleDistributionRibbon";
import { ProgramStatStrip } from "../shared/ProgramStatStrip";
import type { ProgramSummary } from "../useProgramSummaries";
import type { MacrocycleBlock } from "@/types/macrocycle";

/**
 * MacrocycleArc (PR4, §2C) — a macrocycle as a training ARC, not a bare list.
 *
 * Arc header (total span) → a block timeline sized by each block's week count →
 * a sets/week trend line across the blocks, which is what makes the periodization
 * legible at a glance (e.g. 112 -> 53 tapering into a lighter block).
 *
 * ── NO PHASE CHIP (planning ruling 2026-07-13) ──────────────────────────────
 * §2C asks each block to be "labeled with its phase intent (Hypertrophy ->
 * Strength -> Peak)". There is NOWHERE to read that from:
 *   macrocycle_mesocycles = (macrocycle_id, program_template_id, sequence)
 *   macrocycles           = (id, coach_id, name, description)
 * No phase / label / goal column exists. Rather than fabricate intent from the
 * data, the chip is DROPPED — the block title (the mesocycle's own name) plus the
 * mono meta carry the block. Real phase intent is a future data-model feature.
 * Do not reintroduce an inferred chip.
 *
 * ── TREND METRIC: sets/week (§6 #4, locked) ─────────────────────────────────
 * Not an intensity proxy — we have no per-template load data to build one from.
 *
 * ── CANONICAL ONLY ──────────────────────────────────────────────────────────
 * Volume, ribbon and week counts come from PR2's canonical read
 * (plan_weeks -> plan_sessions -> plan_slots), batched across every block by
 * `useProgramSummaries` — one call, no N+1.
 *
 * NOTE: `MacrocycleBlock.weeks` is derived from the LEGACY `program_template_days`
 * tree (`useMacrocycles.computeProgramWeeks`, ceil(max(day_index)/7)). The arc
 * prefers the CANONICAL week count (`summary.structure.weeks`) and falls back to the
 * legacy figure only for a block with no canonical mirror. On the current seed the
 * two agree (8 = 8), so this changes nothing visible — it just stops the arc being
 * sized by a retiring surface.
 *
 * A block with no canonical mirror renders its metadata (name + weeks) and OMITS the
 * ribbon and volume rather than faking them (the PR2 null-omit discipline).
 */

export interface ArcBlock {
  block: MacrocycleBlock;
  summary: ProgramSummary | undefined;
  /** Weeks used for sizing + the span — canonical when we have it. */
  weeks: number;
  /** Only canonical blocks contribute volume; legacy/absent ones show metadata only. */
  setsPerWeek: number | null;
  daysPerWeek: number | null;
  exercises: number | null;
}

/** Resolve each junction row against its (batched) canonical summary. */
export function buildArcBlocks(
  blocks: MacrocycleBlock[],
  summaries: Map<string, ProgramSummary>,
): ArcBlock[] {
  return blocks.map((block) => {
    const summary = summaries.get(block.programTemplateId);
    const canonical = summary?.source === "canonical";

    return {
      block,
      summary,
      weeks: canonical ? summary.structure.weeks || block.weeks : block.weeks,
      setsPerWeek: canonical ? summary.sets : null,
      daysPerWeek: canonical ? summary.structure.daysPerWeek : null,
      exercises: canonical ? summary.exercises : null,
    };
  });
}

interface MacrocycleArcProps {
  arcBlocks: ArcBlock[];
  isMobile: boolean;
  onOpenProgram: (programTemplateId: string) => void;
  onMove: (fromIdx: number, toIdx: number) => void;
  onRemove: (programTemplateId: string) => void;
  className?: string;
}

export function MacrocycleArc({
  arcBlocks,
  isMobile,
  onOpenProgram,
  onMove,
  onRemove,
  className,
}: MacrocycleArcProps) {
  const totalWeeks = arcBlocks.reduce((sum, b) => sum + b.weeks, 0);
  const blockCount = arcBlocks.length;

  if (blockCount === 0) return null;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Arc header — the whole span in one mono line. */}
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
          {totalWeeks} {totalWeeks === 1 ? "week" : "weeks"} · {blockCount}{" "}
          {blockCount === 1 ? "block" : "blocks"}
        </p>
      </div>

      {/* Volume trend — sets/week across the blocks. */}
      <VolumeTrend arcBlocks={arcBlocks} totalWeeks={totalWeeks} />

      {isMobile ? (
        <div className="space-y-2">
          {arcBlocks.map((ab, i) => (
            <MobileArcBlock
              key={ab.block.programTemplateId}
              arcBlock={ab}
              index={i}
              weekStart={arcBlocks.slice(0, i).reduce((s, x) => s + x.weeks, 0) + 1}
              canMoveUp={i > 0}
              canMoveDown={i < blockCount - 1}
              onMoveUp={() => onMove(i, i - 1)}
              onMoveDown={() => onMove(i, i + 1)}
              onOpen={() => onOpenProgram(ab.block.programTemplateId)}
              onRemove={() => onRemove(ab.block.programTemplateId)}
            />
          ))}
        </div>
      ) : (
        /* Desktop: segments FLEX-SIZED by week count, so the arc's shape is the
           program's shape — a long block looks long. */
        <div className="flex items-stretch gap-2">
          {arcBlocks.map((ab, i) => (
            <DesktopArcBlock
              key={ab.block.programTemplateId}
              arcBlock={ab}
              weekStart={arcBlocks.slice(0, i).reduce((s, x) => s + x.weeks, 0) + 1}
              canMoveLeft={i > 0}
              canMoveRight={i < blockCount - 1}
              onMoveLeft={() => onMove(i, i - 1)}
              onMoveRight={() => onMove(i, i + 1)}
              onOpen={() => onOpenProgram(ab.block.programTemplateId)}
              onRemove={() => onRemove(ab.block.programTemplateId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The sets/week line across the arc. Each block contributes one point, placed at the
 * block's midpoint along the week axis, so the taper is read against real time rather
 * than block index.
 *
 * Blocks with no canonical volume are skipped (never plotted as zero — that would
 * draw a dive to the floor for a block we simply can't measure).
 */
function VolumeTrend({ arcBlocks, totalWeeks }: { arcBlocks: ArcBlock[]; totalWeeks: number }) {
  const points = useMemo(() => {
    if (totalWeeks === 0) return [];
    let cursor = 0;
    const pts: { x: number; y: number; sets: number }[] = [];

    for (const ab of arcBlocks) {
      const mid = cursor + ab.weeks / 2;
      cursor += ab.weeks;
      if (ab.setsPerWeek == null) continue;
      pts.push({ x: (mid / totalWeeks) * 100, y: ab.setsPerWeek, sets: ab.setsPerWeek });
    }
    return pts;
  }, [arcBlocks, totalWeeks]);

  if (points.length < 2) return null;

  const max = Math.max(...points.map((p) => p.y));
  const min = Math.min(...points.map((p) => p.y));
  const span = max - min || 1;
  // Invert Y (SVG origin is top-left) and inset so the stroke never clips.
  const yPct = (v: number) => 100 - ((v - min) / span) * 80 - 10;

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${yPct(p.y)}`).join(" ");

  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Sets / week
      </p>

      {/* The line is an SVG stretched to the container (preserveAspectRatio="none"),
          but the POINTS and LABELS are HTML positioned at the same x% — an SVG
          <circle> under a stretched viewBox renders as a squashed ellipse, and edge-
          anchored labels wouldn't sit under their points. */}
      <div className="relative h-12 w-full">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`Sets per week across blocks: ${points.map((p) => p.sets).join(", ")}`}
        >
          <path
            d={path}
            fill="none"
            className="stroke-primary"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {points.map((p) => (
          <div
            key={p.x}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${yPct(p.y)}%` }}
          >
            <span className="block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          </div>
        ))}

      </div>

      {/* Labels sit in their OWN row, not overlaid — the low point's dot and its
          label were colliding when the taper bottomed out. */}
      <div className="relative h-4">
        {points.map((p) => (
          <span
            key={`lbl-${p.x}`}
            className="absolute -translate-x-1/2 font-mono text-[10px] text-muted-foreground"
            style={{ left: `${p.x}%`, top: 0 }}
          >
            {p.sets}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Shared block body — title, mono meta, mini ribbon. No phase chip (see header). */
function BlockBody({ arcBlock, weekStart }: { arcBlock: ArcBlock; weekStart: number }) {
  const { block, weeks, setsPerWeek, daysPerWeek, exercises, summary } = arcBlock;
  const canonical = summary?.source === "canonical";

  return (
    <>
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Wk {weekStart}–{weekStart + weeks - 1}
      </p>
      <p className="mt-0.5 line-clamp-2 text-sm font-medium">{block.title}</p>

      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
        {weeks} {weeks === 1 ? "wk" : "wks"}
        {daysPerWeek != null && ` · ${daysPerWeek} days/wk`}
      </p>

      {/* Canonical blocks only: volume + ribbon. A block with no canonical mirror
          shows its metadata above and omits these rather than faking them. */}
      {canonical && (
        <>
          <ProgramStatStrip
            sets={setsPerWeek ?? 0}
            exercises={exercises ?? undefined}
            className="mt-1"
          />
          <MuscleDistributionRibbon segments={summary!.ribbon} className="mt-2" />
          {summary!.focus.chips.length > 0 && (
            <p className="mt-1.5 truncate text-[10px] text-muted-foreground">
              {summary!.focus.chips.join(" · ")}
            </p>
          )}
        </>
      )}
    </>
  );
}

function DesktopArcBlock({
  arcBlock,
  weekStart,
  canMoveLeft,
  canMoveRight,
  onMoveLeft,
  onMoveRight,
  onOpen,
  onRemove,
}: {
  arcBlock: ArcBlock;
  weekStart: number;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    // flexGrow by week count — the block's width IS its duration.
    <div
      className="group min-w-0 rounded-lg border border-border bg-card p-3"
      style={{ flexGrow: arcBlock.weeks, flexBasis: 0 }}
    >
      <button type="button" onClick={onOpen} className="w-full min-h-[44px] text-left">
        <BlockBody arcBlock={arcBlock} weekStart={weekStart} />
      </button>

      <div className="mt-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canMoveLeft}
          onClick={onMoveLeft}
          aria-label="Move block earlier"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          disabled={!canMoveRight}
          onClick={onMoveRight}
          aria-label="Move block later"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove block"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function MobileArcBlock({
  arcBlock,
  index,
  weekStart,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onOpen,
  onRemove,
}: {
  arcBlock: ArcBlock;
  index: number;
  weekStart: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[10px] text-muted-foreground">
          {index + 1}
        </span>
        <button type="button" onClick={onOpen} className="min-h-[44px] min-w-0 flex-1 text-left">
          <BlockBody arcBlock={arcBlock} weekStart={weekStart} />
        </button>
      </div>

      <div className="mt-2 flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          disabled={!canMoveUp}
          onClick={onMoveUp}
          aria-label="Move block earlier"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          disabled={!canMoveDown}
          onClick={onMoveDown}
          aria-label="Move block later"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-11 w-11 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove block"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
