// src/hooks/useDeloadRequests.ts
//
// Client-side hook for the deload request flow. Tracks whether the user
// has a pending request, what the last decline date was (for the 7-day
// cool-off), and provides a submit function.
//
// Realtime: subscribes to deload_requests rows for this client so when a
// coach responds, the dashboard flips state without a poll.
//
// Plan: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §10.1, §10.7

import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DeloadRequestStatus {
  /** Pending request currently open (only one at a time per DB constraint). */
  pending: {
    id: string;
    requestedAt: string;
    message: string | null;
  } | null;
  /** Most recent declined request — drives the 7-day cool-off. */
  lastDeclined: {
    id: string;
    respondedAt: string;
    responseMessage: string | null;
  } | null;
}

export interface SubmitDeloadRequestParams {
  subscriptionId: string;
  message?: string;
}

interface UseDeloadRequestsResult {
  status: DeloadRequestStatus;
  loading: boolean;
  /** Submits the request + fires the coach notification. Returns the new row id. */
  submit: (params: SubmitDeloadRequestParams) => Promise<string>;
  /** Cancels the client's currently-pending request. */
  cancelPending: () => Promise<void>;
  /** Days remaining on the 7-day cool-off, or 0 if none. */
  coolOffDaysRemaining: number;
}

const COOLOFF_DAYS = 7;

export function useDeloadRequests(clientUserId: string | null): UseDeloadRequestsResult {
  const [status, setStatus] = useState<DeloadRequestStatus>({ pending: null, lastDeclined: null });
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  // Cool-off calculation.
  const coolOffDaysRemaining = (() => {
    if (!status.lastDeclined) return 0;
    const respondedAt = new Date(status.lastDeclined.respondedAt).getTime();
    const allowedAt = respondedAt + COOLOFF_DAYS * 24 * 60 * 60 * 1000;
    const remainingMs = allowedAt - Date.now();
    if (remainingMs <= 0) return 0;
    return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
  })();

  const fetchStatus = useCallback(async () => {
    if (!clientUserId) {
      setStatus({ pending: null, lastDeclined: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    const [pendingRes, declinedRes] = await Promise.all([
      supabase.rpc("get_pending_deload_request_for_client", { p_client_id: clientUserId }),
      supabase.rpc("get_last_declined_deload_request_for_client", { p_client_id: clientUserId }),
    ]);
    const pendingRow = (pendingRes.data ?? [])[0] ?? null;
    const declinedRow = (declinedRes.data ?? [])[0] ?? null;
    setStatus({
      pending: pendingRow
        ? {
            id: pendingRow.request_id,
            requestedAt: pendingRow.requested_at,
            message: pendingRow.client_message ?? null,
          }
        : null,
      lastDeclined: declinedRow
        ? {
            id: declinedRow.request_id,
            respondedAt: declinedRow.coach_responded_at,
            responseMessage: declinedRow.coach_response_message ?? null,
          }
        : null,
    });
    setLoading(false);
  }, [clientUserId]);

  useEffect(() => {
    if (!clientUserId) return;
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchStatus();
  }, [clientUserId, fetchStatus]);

  // Realtime: any change to this client's requests refreshes status.
  useEffect(() => {
    if (!clientUserId) return;
    const channel = supabase
      .channel(`deload_requests_${clientUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "deload_requests",
          filter: `client_id=eq.${clientUserId}`,
        },
        () => {
          fetchStatus();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientUserId, fetchStatus]);

  const submit = useCallback(
    async (params: SubmitDeloadRequestParams): Promise<string> => {
      if (!clientUserId) throw new Error("No client user");
      const messageValue = params.message?.trim() || null;
      const { data, error } = await supabase
        .from("deload_requests")
        .insert({
          client_id: clientUserId,
          subscription_id: params.subscriptionId,
          client_message: messageValue,
          status: "pending",
        })
        .select("id")
        .single();
      if (error) {
        // Friendlier copy for the unique-violation path (someone clicked
        // the button twice or the realtime subscription missed an update).
        if (error.code === "23505") {
          throw new Error("You already have a pending deload request.");
        }
        throw error;
      }
      const requestId = data.id;

      // Fire the coach notification fire-and-forget. Failure here doesn't
      // roll back the INSERT -- the row is the source of truth.
      supabase.functions
        .invoke("send-deload-request-email", {
          body: { request_id: requestId },
        })
        .catch((err) => {
          console.warn("[useDeloadRequests] email notify:", err?.message ?? err);
        });

      // Optimistic update so the UI flips instantly without waiting for
      // the realtime subscription to round-trip.
      setStatus((prev) => ({
        ...prev,
        pending: {
          id: requestId,
          requestedAt: new Date().toISOString(),
          message: messageValue,
        },
      }));

      return requestId;
    },
    [clientUserId],
  );

  const cancelPending = useCallback(async () => {
    if (!status.pending) return;
    const { error } = await supabase
      .from("deload_requests")
      .update({ status: "cancelled" })
      .eq("id", status.pending.id);
    if (error) throw error;
    setStatus((prev) => ({ ...prev, pending: null }));
  }, [status.pending]);

  return { status, loading, submit, cancelPending, coolOffDaysRemaining };
}
