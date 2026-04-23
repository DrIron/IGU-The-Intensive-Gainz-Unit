import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const POLL_INTERVAL_MS = 60_000;

interface UnreadState {
  count: number;
  isLoading: boolean;
}

/**
 * Per-thread unread count for the authenticated viewer.
 *
 * Backed by the SECURITY DEFINER RPC `get_unread_message_count`, which
 * scopes to a single client's thread and filters out the caller's own
 * messages. RLS + the RPC's internal auth check ensure unauthorised
 * viewers get 0 without an error.
 *
 * Refresh strategy: initial fetch + poll every 60s + on tab focus.
 * Cheap enough for the nav badge; no realtime subscription.
 *
 * Pass `null` / `undefined` for `clientUserId` to pause fetching (e.g.
 * before the viewer's id has resolved).
 */
export function useUnreadMessageCount(
  clientUserId: string | null | undefined,
): UnreadState {
  const [count, setCount] = useState(0);
  const [isLoading, setIsLoading] = useState(!!clientUserId);

  const fetchCount = useCallback(async () => {
    if (!clientUserId) {
      setCount(0);
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_unread_message_count", {
      p_client_id: clientUserId,
    });
    if (error) {
      // Expected for unauthorised viewers or a missing thread -- treat as 0.
      console.warn("[useUnreadMessageCount]", error.message);
      setCount(0);
    } else {
      setCount(typeof data === "number" ? data : 0);
    }
    setIsLoading(false);
  }, [clientUserId]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(!!clientUserId);

    fetchCount();

    const interval = window.setInterval(() => {
      if (!cancelled) fetchCount();
    }, POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) fetchCount();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchCount, clientUserId]);

  return { count, isLoading };
}
