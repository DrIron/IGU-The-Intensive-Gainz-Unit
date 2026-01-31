import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Simple authentication guard - requires user to be logged in.
 * Does NOT check roles. Use RoleProtectedRoute for role-specific access.
 * 
 * Use this for routes accessible to any authenticated user:
 * - /dashboard, /account, /onboarding, etc.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      // Ignore INITIAL_SESSION with null - localStorage may still be loading
      if (event === 'INITIAL_SESSION' && !session) {
        return;
      }

      setSession(session);

      if (!session) {
        // Add delay before redirect to allow localStorage to be read
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!mounted) return;

        // Re-check session after delay
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        if (freshSession) {
          setSession(freshSession);
          setLoading(false);
          return;
        }

        setLoading(false);
        navigate("/auth", { replace: true });
        return;
      }

      setLoading(false);
    });

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      setSession(session);

      if (!session) {
        // Add delay before redirect to allow localStorage to be read
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!mounted) return;

        // Re-check session after delay
        const { data: { session: freshSession } } = await supabase.auth.getSession();
        if (freshSession) {
          setSession(freshSession);
          setLoading(false);
          return;
        }

        setLoading(false);
        navigate("/auth", { replace: true });
        return;
      }

      setLoading(false);
    };

    checkAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return session ? <>{children}</> : null;
}
