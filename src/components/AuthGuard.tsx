import { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";

/**
 * Context to share the authenticated session with child components.
 * Avoids redundant getSession() calls in OnboardingGuard and others.
 */
const AuthSessionContext = createContext<Session | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuthGuardSession(): Session | null {
  return useContext(AuthSessionContext);
}

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Simple authentication guard - requires user to be logged in.
 * Does NOT check roles. Use RoleProtectedRoute for role-specific access.
 *
 * Provides the authenticated session to children via AuthSessionContext.
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

      if (event === 'INITIAL_SESSION') {
        if (session) {
          setSession(session);
          setLoading(false);
        } else {
          // INITIAL_SESSION with null — re-check getSession() immediately
          // (no artificial delay — Supabase reads localStorage synchronously)
          const { data: { session: freshSession } } = await supabase.auth.getSession();
          if (!mounted) return;

          if (freshSession) {
            setSession(freshSession);
            setLoading(false);
          } else {
            setLoading(false);
            navigate("/auth", { replace: true });
          }
        }
        return;
      }

      setSession(session);

      if (!session) {
        setLoading(false);
        navigate("/auth", { replace: true });
        return;
      }

      setLoading(false);
    });

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;

      if (session) {
        setSession(session);
        setLoading(false);
        return;
      }
      // Don't redirect yet — onAuthStateChange INITIAL_SESSION handles this
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

  return session ? (
    <AuthSessionContext.Provider value={session}>
      {children}
    </AuthSessionContext.Provider>
  ) : null;
}
