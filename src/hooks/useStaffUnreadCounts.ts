import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Slow-path fallback -- realtime usually fires the update within a
// second or two, but if the socket drops or the client is behind a
// proxy that breaks websockets, this safety net still catches new
// messages. Matches the cadence used by useUnreadMessageCount.
const FALLBACK_POLL_MS = 5 * 60 * 1000;

interface StaffUnreadState {
  /** Map of client_id -> unread message count for the current viewer. */
  counts: Record<string, number>;
  isLoading: boolean;
}

/**
 * One-shot unread lookup for the staff user's entire client roster.
 *
 * Backed by the `get_unread_message_counts_for_staff` RPC -- a single
 * round trip that returns every (client_id, unread_count) pair the
 * authenticated user can see. Use this on the coach client directory
 * instead of calling `useUnreadMessageCount(clientId)` per row, which
 * would create N queries.
 *
 * Refresh: realtime subscription on any change to coach_client_messages
 * invalidates the cached map (no per-client filter -- we care about every
 * thread the viewer can see). Safety nets: 5-minute fallback poll in
 * case the socket drops, tab-focus refresh after a backgrounded tab.
 *
 * Returns `{}` silently on auth loss or missing table -- the RPC is
 * scoped internally, so unauthorised callers get an empty result set
 * rather than an error.
 */
export function useStaffUnreadCounts(enabled: boolean = true): StaffUnreadState {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(enabled);

  const fetchCounts = useCallback(async () => {
    if (!enabled) {
      setCounts({});
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_unread_message_counts_for_staff");
    if (error) {
      console.warn("[useStaffUnreadCounts]", error.message);
      setCounts({});
      setIsLoading(false);
      return;
    }
    const next: Record<string, number> = {};
    for (const row of (data ?? []) as Array<{ client_id: string; unread_count: number }>) {
      next[row.client_id] = Number(row.unread_count) || 0;
    }
    setCounts(next);
    setIsLoading(false);
  }, [enabled]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(enabled);
    fetchCounts();

    if (!enabled) return;

    // Realtime: any change anywhere in coach_client_messages invalidates
    // the cached counts. RLS filters at the DB layer, so our subscription
    // only receives rows we're authorised to see. No client_id filter on
    // the channel -- the batch RPC aggregates across every client the
    // caller can access, so every event is potentially interesting.
    const channel = supabase
      .channel("ccm-staff-unread")
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "coach_client_messages",
        },
        () => {
          if (!cancelled) fetchCounts();
        },
      )
      .subscribe();

    const interval = window.setInterval(() => {
      if (!cancelled) fetchCounts();
    }, FALLBACK_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) fetchCounts();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchCounts, enabled]);

  return { counts, isLoading };
}
