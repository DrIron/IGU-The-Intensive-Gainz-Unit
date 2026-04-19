import { createContext, useContext, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";

/**
 * Build the /auth URL with a `redirect` param pointing back to `path`, unless
 * the user is already on /auth (avoids ?redirect=/auth chains). Auth.tsx
 * validates the param with .startsWith('/') before navigating.
 */
function authUrlWithRedirect(path: string): string {
  if (path === "/auth" || path.startsWith("/auth?") || !path.startsWith("/")) {
    return "/auth";
  }
  return `/auth?redirect=${encodeURIComponent(path)}`;
}

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
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    // Preserve the deep-link target so the user lands back here after signing in.
    // Do NOT preserve on SIGNED_OUT — that was an explicit logout.
    const redirectTarget = location.pathname + location.search;

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
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
            ]);
            if (!mounted) return;

            const freshSession = result && 'data' in result ? result.data.session : null;
            if (freshSession) {
              setSession(freshSession);
              setLoading(false);
            } else {
              setLoading(false);
              navigate(authUrlWithRedirect(redirectTarget), { replace: true });
            }
          } catch {
            if (mounted) {
              setLoading(false);
              navigate(authUrlWithRedirect(redirectTarget), { replace: true });
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

    // Safety timeout — if no auth event resolves loading within 8s, stop waiting.
    // Was 12s, but session recovery via setSession() in client.ts now fires
    // INITIAL_SESSION faster. 8s still accommodates slow mobile networks.
    const safetyTimer = setTimeout(() => {
      if (!mounted) return;
      setLoading((prev) => {
        if (prev) {
          if (import.meta.env.DEV) console.warn('[AuthGuard] Safety timeout — forcing loading=false');
          return false;
        }
        return prev;
      });
    }, 8000);

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
    // location.pathname/search are intentionally NOT in deps -- AuthGuard
    // remounts per protected route (React Router renders children conditionally),
    // so redirectTarget is captured fresh on each mount. Re-subscribing to
    // onAuthStateChange on every in-page nav would be wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return session ? (
    <AuthSessionContext.Provider value={session}>
      {children}
    </AuthSessionContext.Provider>
  ) : null;
}
