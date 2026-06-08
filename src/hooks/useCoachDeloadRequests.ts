// src/hooks/useCoachDeloadRequests.ts
//
// Coach-side hooks for the deload request flow.
//
//   useCoachDeloadRequestForClient   — one client, one pending row (Overview panel)
//   useCoachDeloadRequestCounts      — batch counts for the roster badge
//
// Plan: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §10.2, §10.5

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ──────────────────────────────────────────────────────────────────────────────
// Per-client pending request
// ──────────────────────────────────────────────────────────────────────────────

export interface CoachPendingDeloadRequest {
  id: string;
  requestedAt: string;
  clientMessage: string | null;
}

export interface RespondToDeloadParams {
  requestId: string;
  decision: "approved" | "declined";
  responseMessage?: string;
  /** Required when decision === 'approved'. Which week of the client's program. */
  approvedWeekOffset?: number;
  /** Required when decision === 'approved'. Matches deloadPresets.ts ids. */
  appliedPresetId?: string;
}

interface UseCoachDeloadRequestForClientResult {
  pending: CoachPendingDeloadRequest | null;
  loading: boolean;
  refresh: () => Promise<void>;
  respond: (params: RespondToDeloadParams) => Promise<void>;
}

export function useCoachDeloadRequestForClient(
  clientUserId: string | null,
): UseCoachDeloadRequestForClientResult {
  const [pending, setPending] = useState<CoachPendingDeloadRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const fetchPending = useCallback(async () => {
    if (!clientUserId) {
      setPending(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc(
      "get_pending_deload_request_for_client",
      { p_client_id: clientUserId },
    );
    if (error) {
      console.warn("[useCoachDeloadRequestForClient]", error.message);
    }
    const row = (data ?? [])[0] ?? null;
    setPending(
      row
        ? {
            id: row.request_id,
            requestedAt: row.requested_at,
            clientMessage: row.client_message ?? null,
          }
        : null,
    );
    setLoading(false);
  }, [clientUserId]);

  useEffect(() => {
    if (!clientUserId) return;
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    fetchPending();
  }, [clientUserId, fetchPending]);

  // Realtime — flip the panel when the client cancels or someone else responds.
  useEffect(() => {
    if (!clientUserId) return;
    const channel = supabase
      .channel(`coach_deload_${clientUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deload_requests",
          filter: `client_id=eq.${clientUserId}`,
        },
        () => {
          fetchPending();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientUserId, fetchPending]);

  const respond = useCallback(
    async (params: RespondToDeloadParams) => {
      const { error } = await supabase
        .from("deload_requests")
        .update({
          status: params.decision,
          coach_responded_at: new Date().toISOString(),
          coach_response_message: params.responseMessage?.trim() || null,
          coach_user_id: (await supabase.auth.getUser()).data.user?.id ?? null,
          approved_week_offset:
            params.decision === "approved" ? params.approvedWeekOffset ?? null : null,
          applied_preset_id:
            params.decision === "approved" ? params.appliedPresetId ?? null : null,
        })
        .eq("id", params.requestId);
      if (error) throw error;

      // Fire-and-forget client notification.
      supabase.functions
        .invoke("send-deload-response-email", { body: { request_id: params.requestId } })
        .catch((err) => {
          console.warn("[useCoachDeloadRequestForClient] response email:", err?.message ?? err);
        });

      setPending(null);
    },
    [],
  );

  return { pending, loading, refresh: fetchPending, respond };
}

// ──────────────────────────────────────────────────────────────────────────────
// Batch pending counts (CoachMyClientsPage badges)
// ──────────────────────────────────────────────────────────────────────────────

export type DeloadRequestCounts = Map<string, number>;

interface UseCoachDeloadRequestCountsResult {
  counts: DeloadRequestCounts;
  totalPending: number;
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useCoachDeloadRequestCounts(
  coachUserId: string | null,
): UseCoachDeloadRequestCountsResult {
  const [counts, setCounts] = useState<DeloadRequestCounts>(new Map());
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  const fetchCounts = useCallback(async () => {
    if (!coachUserId) {
      setCounts(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.rpc("get_coach_deload_request_counts");
    if (error) {
      console.warn("[useCoachDeloadRequestCounts]", error.message);
      setLoading(false);
      return;
    }
    const next = new Map<string, number>();
    for (const row of data ?? []) {
      if (row.client_id) next.set(row.client_id, row.pending_count ?? 0);
    }
    setCounts(next);
    setLoading(false);
  }, [coachUserId]);

  useEffect(() => {
    if (!coachUserId) return;
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchCounts();
  }, [coachUserId, fetchCounts]);

  // Realtime — any row change touching one of our visible clients refreshes
  // the batch. We can't filter by coach on the RLS-protected table (the
  // table's coach_user_id is set on response, not request); subscribing to
  // all rows is fine since pending count changes are sparse.
  useEffect(() => {
    if (!coachUserId) return;
    const channel = supabase
      .channel(`coach_deload_counts_${coachUserId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deload_requests" },
        () => {
          fetchCounts();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [coachUserId, fetchCounts]);

  let totalPending = 0;
  counts.forEach((v) => (totalPending += v));

  return { counts, totalPending, loading, refresh: fetchCounts };
}
