import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Whether the signed-in user is eligible to leave a testimonial: a client with at least one
 * coach subscription (any status) — the same client-of-coach relationship the /testimonial form
 * (and its RLS gate) requires. Non-authed users and non-clients get `canLeave: false`, so no
 * submit entry point is shown to them. Cheap: one bounded subscription probe.
 */
export function useCanLeaveTestimonial(): { canLeave: boolean; loading: boolean } {
  const [canLeave, setCanLeave] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setCanLeave(false);
          return;
        }
        const { data } = await supabase
          .from("subscriptions")
          .select("coach_id")
          .eq("user_id", user.id)
          .not("coach_id", "is", null)
          .limit(1);
        setCanLeave((data?.length ?? 0) > 0);
      } catch {
        setCanLeave(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { canLeave, loading };
}
