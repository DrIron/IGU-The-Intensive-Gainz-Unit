import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import { KUWAIT_UTC_OFFSET_HOURS } from "@/lib/kuwaitTime";

/**
 * useWeeklyConsistency (CL5) — which days this week the client actually trained.
 *
 * PRESENCE, NOT A STREAK. This hook only ever answers "what happened"; it has no
 * concept of a broken chain, a miss, or a failure. The component renders absence as
 * a neutral outline dot. See WeekConsistencyDots for the framing rule.
 *
 * SIGNAL: a day is "active" if the client logged at least one non-skipped set that
 * day (`exercise_set_logs.created_at`, keyed by `created_by_user_id`). That is the
 * minimum the spec asks for, and it is the honest one — the client did a workout.
 *
 * Check-in days are NOT folded in: `useCanonicalWeeklyAdherence` exposes only
 * per-WEEK counts (modules + completed totals, no dates), so there is no cheap
 * per-day check-in signal to union in. Adding one would mean a second schedule read
 * — out of scope, and workout-logged is the agreed minimum.
 *
 * ── WEEK BOUNDARY: MONDAY, not Sunday ───────────────────────────────────────
 * The IGU week starts MONDAY (`startOfIguWeek` = `weekStartsOn: 1`;
 * `useCanonicalWeeklyAdherence.ts:44-45` literally names its bounds mondayIso /
 * sundayIso). A Sunday-first strip would put a Sunday workout in *this* week's dots
 * but *last* week's adherence — two cards on the same dashboard disagreeing about
 * "this week". So the row runs Mon→Sun.
 *
 * ── TIMEZONE: Kuwait wall-clock ─────────────────────────────────────────────
 * `created_at` is a UTC instant. Bucketing it by UTC date would push a 00:30 Kuwait
 * workout (21:30 UTC the previous day) onto the wrong dot. Both the week window and
 * the day buckets are therefore computed in Kuwait wall-clock (CLAUDE.md).
 */

const MS_PER_DAY = 86_400_000;
const KUWAIT_OFFSET_MS = KUWAIT_UTC_OFFSET_HOURS * 3_600_000;

/** The Kuwait calendar date (YYYY-MM-DD) an instant falls on. */
export function kuwaitDateIso(instant: Date): string {
  return new Date(instant.getTime() + KUWAIT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The 7 Kuwait dates of the current IGU week (Monday → Sunday). */
export function currentIguWeekDates(now: Date = new Date()): string[] {
  const todayIso = kuwaitDateIso(now);
  // Anchor at UTC midnight of the Kuwait date so the arithmetic is DST/offset-free.
  const anchor = new Date(`${todayIso}T00:00:00Z`);
  // getUTCDay(): 0 = Sunday. Monday-start → Sunday is 6 days from Monday.
  const daysSinceMonday = (anchor.getUTCDay() + 6) % 7;
  const monday = new Date(anchor.getTime() - daysSinceMonday * MS_PER_DAY);

  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday.getTime() + i * MS_PER_DAY).toISOString().slice(0, 10),
  );
}

export interface WeeklyConsistency {
  loading: boolean;
  /** The 7 Kuwait dates of this week, Monday → Sunday. */
  weekDates: string[];
  /** The subset of `weekDates` on which a workout was logged. */
  activeDates: Set<string>;
  activeCount: number;
}

export function useWeeklyConsistency(userId: string | undefined): WeeklyConsistency {
  const [weekDates] = useState<string[]>(() => currentIguWeekDates());
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(
    async (uid: string, dates: string[]) => {
      try {
        // Kuwait midnight → the matching UTC instants.
        const fromUtc = new Date(`${dates[0]}T00:00:00+03:00`).toISOString();
        const toUtc = new Date(`${dates[6]}T23:59:59.999+03:00`).toISOString();

        const { data, error } = await supabase
          .from("exercise_set_logs")
          .select("created_at, skipped")
          .eq("created_by_user_id", uid)
          .gte("created_at", fromUtc)
          .lte("created_at", toUtc);

        if (error) throw error;

        const active = new Set<string>();
        for (const row of data ?? []) {
          // A set the client explicitly skipped is not evidence they trained.
          if (row.skipped === true) continue;
          if (!row.created_at) continue;
          active.add(kuwaitDateIso(new Date(row.created_at)));
        }
        setActiveDates(active);
      } catch (err) {
        // A failed read must not invent absence — it would show the client an empty
        // week they did not have. Stay silent and render nothing (see the component).
        captureException(err, { source: "useWeeklyConsistency" });
        setActiveDates(new Set());
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    if (hasFetched.current === userId) return;
    hasFetched.current = userId;
    void load(userId, weekDates);
  }, [userId, weekDates, load]);

  return {
    loading,
    weekDates,
    activeDates,
    activeCount: weekDates.filter((d) => activeDates.has(d)).length,
  };
}
