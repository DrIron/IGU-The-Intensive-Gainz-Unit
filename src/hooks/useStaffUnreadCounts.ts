import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL_MS = 60_000;

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
 * Refresh: initial fetch + 60s poll + on tab visibility. No realtime
 * subscription; matches the "refresh on open" design decision.
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

    const interval = window.setInterval(() => {
      if (!cancelled) fetchCounts();
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) fetchCounts();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchCounts, enabled]);

  return { counts, isLoading };
}
