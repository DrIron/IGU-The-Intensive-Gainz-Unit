import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_TYPE_LABELS,
  defaultSessionName,
  getMuscleDisplay,
  resolveParentMuscleId,
  type MuscleSlotData,
  type SessionData,
} from "@/types/muscle-builder";
import { SessionTypeBar } from "./SessionTypeBar";
import { ProgramStatStrip } from "./ProgramStatStrip";

/**
 * WeekBreakdownCard (PR3, §2B.3) — one microcycle, read-only.
 *
 * "Week 2 · 4 sessions · 78 sets", then a row per training day (session-type rail +
 * title + mono counts). Expanding a day reveals its exercises with prescriptions.
 * Rest days render as a muted row rather than being silently omitted — a coach
 * scanning a week needs to see the shape of it, gaps included.
 *
 * Presentational only (§11.1): the caller adapts the canonical rows and hands them
 * in. No fetching, no Supabase, canonical `plan_slots` only.
 *
 * Progression week-collapse ("Weeks 2-4 repeat Week 1 + load") is deliberately NOT
 * here — it was an optional stretch and every week renders in full with its deload
 * badge instead. Deferred rather than half-built.
 */

/** Mon-first, matching the IGU week (startOfIguWeek = weekStartsOn: 1). */
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export interface WeekBreakdown {
  weekId: string;
  weekIndex: number;
  isDeload: boolean;
  sessions: SessionData[];
  slots: MuscleSlotData[];
}

interface WeekBreakdownCardProps {
  week: WeekBreakdown;
  /** Mobile collapses to the header summary; desktop opens expanded. */
  defaultCollapsed?: boolean;
  className?: string;
}

/** Strength slots only — activities carry no set volume. */
function strengthOf(slots: MuscleSlotData[]) {
  return slots.filter((s) => !s.activityType || s.activityType === "strength");
}

function setsOf(slots: MuscleSlotData[]) {
  return strengthOf(slots).reduce((sum, s) => sum + s.sets, 0);
}

/** A day's title: the coach's session name, else the §6 muscle / activity fallback. */
function sessionTitle(session: SessionData, slots: MuscleSlotData[]): string {
  const named = session.name?.trim();
  if (named) return named;

  if (session.type && session.type !== "strength") {
    return ACTIVITY_TYPE_LABELS[session.type] ?? defaultSessionName(session.type);
  }

  // Dominant parent muscle by volume — the same fallback the focus chips use.
  const byMuscle = new Map<string, number>();
  for (const slot of strengthOf(slots)) {
    if (!slot.muscleId) continue;
    const parent = resolveParentMuscleId(slot.muscleId);
    byMuscle.set(parent, (byMuscle.get(parent) ?? 0) + slot.sets);
  }
  let topId: string | null = null;
  let topSets = -1;
  for (const [id, sets] of byMuscle) {
    if (sets > topSets) {
      topId = id;
      topSets = sets;
    }
  }
  const display = topId ? getMuscleDisplay(topId) : null;
  return display ? `${display.label} focus` : defaultSessionName(session.type);
}

/** "4 × 8–10", or "4 × 10" when the rep range is a single value. */
function prescriptionOf(slot: MuscleSlotData): string | null {
  if (slot.sets <= 0) return null;
  const { repMin, repMax } = slot;
  if (!repMin && !repMax) return `${slot.sets} sets`;
  const reps = repMin && repMax && repMin !== repMax ? `${repMin}–${repMax}` : `${repMax || repMin}`;
  return `${slot.sets} × ${reps}`;
}

export function WeekBreakdownCard({ week, defaultCollapsed = false, className }: WeekBreakdownCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const sessionCount = week.sessions.length;

  const { days, totalSets, totalExercises } = useMemo(() => {
    const slotsBySession = new Map<string, MuscleSlotData[]>();
    for (const slot of week.slots) {
      if (!slot.sessionId) continue;
      const list = slotsBySession.get(slot.sessionId) ?? [];
      list.push(slot);
      slotsBySession.set(slot.sessionId, list);
    }

    // One entry per weekday 1-7, so rest days are visible rather than skipped.
    const byDay = Array.from({ length: 7 }, (_, i) => {
      const dayIndex = i + 1;
      const daySessions = week.sessions
        .filter((s) => s.dayIndex === dayIndex)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((session) => {
          const sessionSlots = (slotsBySession.get(session.id) ?? []).slice().sort(
            (a, b) => a.sortOrder - b.sortOrder,
          );
          return { session, slots: sessionSlots };
        });
      return { dayIndex, sessions: daySessions };
    });

    return {
      days: byDay,
      totalSets: setsOf(week.slots),
      totalExercises: strengthOf(week.slots).length,
    };
  }, [week]);

  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      {/* Week header — tappable (44px target) so mobile can collapse the whole week. */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span className="text-sm font-semibold">Week {week.weekIndex}</span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {sessionCount} {sessionCount === 1 ? "session" : "sessions"}
          </span>
          {week.isDeload && (
            <Badge variant="outline" className="text-[10px] font-mono uppercase tracking-wider">
              Deload
            </Badge>
          )}
        </div>
        {/* Week totals via the PR1 primitive — "12 exercises · 78 sets". */}
        <ProgramStatStrip sets={totalSets} exercises={totalExercises} className="shrink-0" />
      </button>

      {!collapsed && (
        <div className="space-y-1 px-3 pb-3">
          {days.map(({ dayIndex, sessions }) =>
            sessions.length === 0 ? (
              <RestRow key={dayIndex} dayIndex={dayIndex} />
            ) : (
              sessions.map(({ session, slots }) => (
                <DayRow key={session.id} dayIndex={dayIndex} session={session} slots={slots} />
              ))
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** A rest day. Muted, present — a gap in the week is information. */
function RestRow({ dayIndex }: { dayIndex: number }) {
  return (
    <div className="flex min-h-[44px] items-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground/70">
      <span className="w-10 shrink-0 font-mono text-[10px] uppercase">{DAY_NAMES[dayIndex - 1]}</span>
      <span className="italic">Rest</span>
    </div>
  );
}

/** One training day: type rail + title + counts, expanding to its exercises. */
function DayRow({
  dayIndex,
  session,
  slots,
}: {
  dayIndex: number;
  session: SessionData;
  slots: MuscleSlotData[];
}) {
  const [open, setOpen] = useState(false);

  const title = sessionTitle(session, slots);
  const exercises = strengthOf(slots).length;
  const sets = setsOf(slots);

  return (
    <SessionTypeBar activityType={session.type} className="ml-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 py-1.5 pl-1 pr-2 text-left"
      >
        <span className="w-10 shrink-0 font-mono text-[10px] uppercase text-muted-foreground">
          {DAY_NAMES[dayIndex - 1]}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {exercises > 0 && (
            <>
              {exercises} {exercises === 1 ? "exercise" : "exercises"}
              {sets > 0 && " · "}
            </>
          )}
          {sets > 0 && `${sets} sets`}
        </span>
      </button>

      {open && (
        <ul className="space-y-1 pb-2 pl-1 pr-2">
          {slots.map((slot) => (
            <li key={slot.id} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-muted-foreground">{slotLabel(slot)}</span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {slotDetail(slot)}
              </span>
            </li>
          ))}
          {slots.length === 0 && (
            <li className="text-xs italic text-muted-foreground/70">No exercises in this session.</li>
          )}
        </ul>
      )}
    </SessionTypeBar>
  );
}

/** Strength: the exercise name (falling back to the muscle). Activity: its label. */
function slotLabel(slot: MuscleSlotData): string {
  if (slot.activityType && slot.activityType !== "strength") {
    return slot.activityName || ACTIVITY_TYPE_LABELS[slot.activityType] || "Activity";
  }
  if (slot.exercise?.name) return slot.exercise.name;
  const display = slot.muscleId ? getMuscleDisplay(resolveParentMuscleId(slot.muscleId)) : null;
  return display?.label ?? "Exercise";
}

/** Strength: "4 × 8–10". Activity: its duration. */
function slotDetail(slot: MuscleSlotData): string {
  if (slot.activityType && slot.activityType !== "strength") {
    return slot.duration ? `${slot.duration} min` : "";
  }
  return prescriptionOf(slot) ?? "";
}
