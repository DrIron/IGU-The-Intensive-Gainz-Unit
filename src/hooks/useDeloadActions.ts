/**
 * Deload v2 — on-demand deload trigger actions for one client_plan_assignment. See docs/DELOAD_V2.md.
 *
 * Surfaces whether the followed plan offers an on-demand deload, the deloads already inserted into
 * this assignment, and the position a "take a deload this week" would splice at. Calls the
 * insert_client_deload / remove_client_deload RPCs (insert + shift, applies immediately — no coach
 * approval). When a client self-applies, posts a coach_client_messages notification (reuses the
 * messaging/unread/email plumbing). Inert unless board_v2 is enabled.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { isBoardV2Enabled } from "@/lib/featureFlags";
import { insertPositionForDate, type SequencePlanWeek, type SequenceInsert } from "@/lib/deloadSequence";
import { captureException } from "@/lib/errorLogging";

export interface InsertedDeload {
  id: string;
  position_week_index: number;
  source_plan_week_id: string;
  preset_id: string | null;
}

export interface DeloadActions {
  /** The followed plan has an on-demand deload week that can be inserted. */
  available: boolean;
  /** Deloads already spliced into this assignment (sorted by position). */
  inserts: InsertedDeload[];
  /** Base-ordinal position a "take a deload this week" would insert at (today). */
  currentPosition: number;
  loading: boolean;
  /** Insert the on-demand deload effective this week. notifyCoach posts a client→coach message. */
  takeDeload: () => Promise<boolean>;
  removeDeload: (id: string) => Promise<boolean>;
  refresh: () => void;
}

interface UseDeloadActionsOpts {
  assignmentId: string | null;
  planId: string | null;
  startDate: string | null; // assignment start_date (YYYY-MM-DD)
  clientId: string | null; // for the coach-notification message thread
  /** When true (client side), a self-applied deload posts a coach_client_messages notification. */
  notifyCoach?: boolean;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function useDeloadActions({
  assignmentId,
  planId,
  startDate,
  clientId,
  notifyCoach = false,
}: UseDeloadActionsOpts): DeloadActions {
  const enabled = isBoardV2Enabled();
  const [weeks, setWeeks] = useState<SequencePlanWeek[]>([]);
  const [template, setTemplate] = useState<{ id: string; presetId: string | null } | null>(null);
  const [inserts, setInserts] = useState<InsertedDeload[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (!enabled || !assignmentId || !planId) {
      setWeeks([]);
      setInserts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: weekRows }, { data: insRows }] = await Promise.all([
        supabase
          .from("plan_weeks")
          .select("id, week_index, is_deload, deload_placement, deload_preset_id")
          .eq("plan_id", planId)
          .order("week_index"),
        supabase
          .from("client_plan_inserted_deloads")
          .select("id, position_week_index, source_plan_week_id, preset_id")
          .eq("assignment_id", assignmentId)
          .order("position_week_index"),
      ]);
      if (cancelled) return;
      const mappedWeeks = (weekRows ?? []).map((w) => ({
        id: w.id,
        week_index: w.week_index,
        is_deload: !!w.is_deload,
        deload_placement: (w.deload_placement as string | null) ?? null,
      }));
      setWeeks(mappedWeeks);
      // The on-demand deload TEMPLATE in the followed plan (first one wins).
      const tmpl = (weekRows ?? []).find((w) => w.is_deload && w.deload_placement === "on_demand");
      setTemplate(tmpl ? { id: tmpl.id, presetId: (tmpl.deload_preset_id as string | null) ?? null } : null);
      setInserts(
        (insRows ?? []).map((r) => ({
          id: r.id,
          position_week_index: r.position_week_index,
          source_plan_week_id: r.source_plan_week_id,
          preset_id: (r.preset_id as string | null) ?? null,
        })),
      );
      setLoading(false);
    })().catch((err) => {
      if (!cancelled) {
        captureException(err, { source: "useDeloadActions.load", severity: "warning" });
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, assignmentId, planId, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const insertSeq: SequenceInsert[] = inserts.map((i) => ({
    position_week_index: i.position_week_index,
    source_plan_week_id: i.source_plan_week_id,
    preset_id: i.preset_id,
  }));
  const currentPosition = startDate
    ? insertPositionForDate(startDate, todayIso(), weeks, insertSeq)
    : 1;

  const takeDeload = useCallback(async (): Promise<boolean> => {
    if (!enabled || !assignmentId || !template || busyRef.current) return false;
    busyRef.current = true;
    try {
      const { error } = await supabase.rpc("insert_client_deload", {
        p_assignment_id: assignmentId,
        p_position_week_index: currentPosition,
        p_source_plan_week_id: template.id,
        p_preset_id: template.presetId,
      });
      if (error) throw error;
      // Notify the coach via the existing thread (client self-apply only).
      if (notifyCoach && clientId) {
        await supabase.from("coach_client_messages").insert({
          client_id: clientId,
          sender_id: clientId,
          message: "I'm taking a recovery (deload) week this week — my plan has shifted out by a week.",
        });
      }
      refresh();
      return true;
    } catch (err) {
      captureException(err, { source: "useDeloadActions.takeDeload", severity: "error" });
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [enabled, assignmentId, template, currentPosition, notifyCoach, clientId, refresh]);

  const removeDeload = useCallback(
    async (id: string): Promise<boolean> => {
      if (!enabled) return false;
      try {
        const { error } = await supabase.rpc("remove_client_deload", { p_id: id });
        if (error) throw error;
        refresh();
        return true;
      } catch (err) {
        captureException(err, { source: "useDeloadActions.removeDeload", severity: "error" });
        return false;
      }
    },
    [enabled, refresh],
  );

  return {
    available: !!template,
    inserts,
    currentPosition,
    loading,
    takeDeload,
    removeDeload,
    refresh,
  };
}
