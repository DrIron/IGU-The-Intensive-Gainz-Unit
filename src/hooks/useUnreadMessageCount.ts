import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Slow-path fallback -- realtime usually fires the update within a
// second or two, but if the socket drops or the client is behind a
// proxy that breaks websockets, this safety net still catches new
// messages. Bumped from 60s to 5min now that realtime is authoritative.
const FALLBACK_POLL_MS = 5 * 60 * 1000;

interface UnreadState {
  count: number;
  isLoading: boolean;
}

/**
 * Per-thread unread count for the authenticated viewer.
 *
 * Backed by `get_unread_message_count` (SECURITY DEFINER). Refresh is
 * now primarily Supabase realtime on the thread's rows -- any INSERT /
 * UPDATE / DELETE of `coach_client_messages` filtered to this
 * `client_id` triggers a recount. Safety nets:
 *   - 5-minute fallback poll in case the realtime socket drops.
 *   - Tab-focus refresh in case the tab was backgrounded while the
 *     socket missed a heartbeat.
 *
 * Pass `null` / `undefined` for `clientUserId` to pause fetching.
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

    if (!clientUserId) return;

    // Realtime: any insert / update / delete on this client's thread
    // invalidates the cached count. Channel name includes the client
    // id so parallel mounts don't share state.
    const channel = supabase
      .channel(`ccm-unread:${clientUserId}`)
      .on(
        // Supabase realtime accepts a string for event and we want
        // all of them; '*' covers INSERT / UPDATE / DELETE.
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "coach_client_messages",
          filter: `client_id=eq.${clientUserId}`,
        },
        () => {
          if (!cancelled) fetchCount();
        },
      )
      .subscribe();

    const interval = window.setInterval(() => {
      if (!cancelled) fetchCount();
    }, FALLBACK_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) fetchCount();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchCount, clientUserId]);

  return { count, isLoading };
}
