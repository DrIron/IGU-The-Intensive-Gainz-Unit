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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      if (event === 'INITIAL_SESSION') {
        if (newSession) {
          setSession(newSession);
          setLoading(false);
        } else {
          // INITIAL_SESSION with null — re-check getSession() with timeout
          try {
            const result = await Promise.race([
              supabase.auth.getSession(),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
            ]);
            if (!mounted) return;

            const freshSession = result && 'data' in result ? result.data.session : null;
            if (freshSession) {
              setSession(freshSession);
              setLoading(false);
            } else {
              setLoading(false);
              navigate("/auth", { replace: true });
            }
          } catch {
            if (mounted) {
              setLoading(false);
              navigate("/auth", { replace: true });
            }
          }
        }
        return;
      }

      if (event === 'SIGNED_IN' && newSession) {
        setSession(newSession);
        setLoading(false);
        return;
      }

      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null);
        setLoading(false);
        navigate("/auth", { replace: true });
        return;
      }

      setSession(newSession);
      setLoading(false);
    });

    // Safety timeout — if no auth event resolves loading within 6s, stop waiting
    const safetyTimer = setTimeout(() => {
      if (!mounted) return;
      setLoading((prev) => {
        if (prev) {
          if (import.meta.env.DEV) console.warn('[AuthGuard] Safety timeout — forcing loading=false');
          return false;
        }
        return prev;
      });
    }, 6000);

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
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
