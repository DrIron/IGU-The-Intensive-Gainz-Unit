import { useState, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface WaitlistGuardProps {
  children: ReactNode;
}

/**
 * Route wrapper that redirects unauthenticated visitors to /waitlist
 * when waitlist mode is enabled in waitlist_settings.
 *
 * - Authenticated users always pass through (no redirect)
 * - When waitlist is disabled or no settings row exists, renders children
 * - Uses hasFetched ref guard to prevent re-fetching
 */
export function WaitlistGuard({ children }: WaitlistGuardProps) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const check = async () => {
      try {
        // Check if user is authenticated
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Authenticated users always pass through
          setAllowed(true);
          setChecking(false);
          return;
        }

        // Check if waitlist is enabled
        const { data } = await supabase
          .from("waitlist_settings")
          .select("is_enabled")
          .limit(1)
          .maybeSingle();

        if (data?.is_enabled) {
          // Unauthenticated + waitlist enabled → redirect
          navigate("/waitlist", { replace: true });
          return;
        }

        // Waitlist off or no settings row → allow through
        setAllowed(true);
      } catch (error) {
        // On error, allow through (fail open)
        console.error("[WaitlistGuard] Error:", error);
        setAllowed(true);
      } finally {
        setChecking(false);
      }
    };

    check();
  }, [navigate]);

  if (checking) {
    return <LoadingSpinner />;
  }

  if (!allowed) {
    return null;
  }

  return <>{children}</>;
}
