import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  isRouteBlockedForRole,
  getPrimaryDashboardForRole,
  canAccessRoute,
  AppRole,
} from "@/lib/routeConfig";

type Role = "admin" | "coach" | "client";

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  requiredRole: Role;
}

/**
 * STRICT Role-based route protection - NO role overlap:
 * - /admin/* requires admin role ONLY - coaches are BLOCKED
 * - /coach/* requires coach role ONLY - admins must use separate coach account
 * - /client routes require client role (no admin/coach role)
 */
export function RoleProtectedRoute({ children, requiredRole }: RoleProtectedRouteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Timeout to prevent infinite loading (increased to 10s to allow for session restoration)
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.error('[RoleProtectedRoute] Loading timeout after 10s - forcing completion');
        setLoading(false);
      }
    }, 10000);

    const checkAuthorization = async (userId: string) => {
      if (!mounted) return;

      try {
        console.log('[RoleProtectedRoute] Fetching roles for user:', userId);
        const { data: rolesData, error: rolesError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        if (rolesError) {
          console.error('[RoleProtectedRoute] Error fetching roles:', rolesError);
        }

        if (!mounted) return;

        const roles = rolesData?.map(r => r.role) || [];
        console.log('[RoleProtectedRoute] Roles fetched:', roles);

        const isAdmin = roles.includes("admin");
        const isCoach = roles.includes("coach");
        const isClient = !isAdmin && !isCoach;
        const currentPath = location.pathname;

        // CRITICAL: Check if user's role is BLOCKED from this route
        const primaryRole: AppRole = isAdmin ? "admin" : isCoach ? "coach" : "client";
        console.log('[RoleProtectedRoute] Primary role:', primaryRole, 'Required:', requiredRole);

        if (isRouteBlockedForRole(currentPath, primaryRole)) {
          console.error("[ACCESS BLOCKED]", {
            userId,
            role: primaryRole,
            attemptedRoute: currentPath,
          });

          toast.error("You don't have access to that page.", {
            description: primaryRole === "coach"
              ? "This area is restricted to administrators only."
              : primaryRole === "admin"
              ? "Admins must use a separate coach account for coach features."
              : "This area requires elevated permissions."
          });

          navigate(getPrimaryDashboardForRole(primaryRole), { replace: true });
          setAuthorized(false);
          setLoading(false);
          return;
        }

        // Secondary check: explicit role requirement
        let isAuthorized = false;
        switch (requiredRole) {
          case "admin":
            isAuthorized = isAdmin;
            if (!isAdmin) {
              toast.error("Access Denied", {
                description: "Admin access required for this page."
              });
              navigate(isCoach ? "/coach/dashboard" : "/dashboard", { replace: true });
            }
            break;

          case "coach":
            isAuthorized = isCoach;
            if (!isCoach) {
              toast.error("Access Denied", {
                description: "Coach access required. Admins must use a separate coach account."
              });
              navigate(isAdmin ? "/admin/dashboard" : "/dashboard", { replace: true });
            }
            break;

          case "client":
            isAuthorized = isClient;
            if (!isClient) {
              toast.error("Access Denied", {
                description: "This page is for clients only."
              });
              navigate(isAdmin ? "/admin/dashboard" : isCoach ? "/coach/dashboard" : "/dashboard", { replace: true });
            }
            break;
        }

        if (mounted) {
          console.log('[RoleProtectedRoute] Authorization complete:', { isAuthorized, requiredRole });
          setAuthorized(isAuthorized);
          setLoading(false);
        }
      } catch (error) {
        console.error("[RoleProtectedRoute] Error checking authorization:", error);
        if (mounted) {
          navigate("/dashboard", { replace: true });
          setLoading(false);
        }
      }
    };

    // Use onAuthStateChange as the single source of truth for session state
    // This ensures we wait for Supabase to fully restore the session from localStorage
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;

      console.log('[RoleProtectedRoute] Auth state change:', event, newSession ? 'session exists' : 'no session');

      // Handle INITIAL_SESSION - this fires when Supabase restores session from localStorage
      // This is the key fix: we wait for this event instead of calling getSession() immediately
      if (event === 'INITIAL_SESSION') {
        if (newSession) {
          console.log('[RoleProtectedRoute] Session restored from storage, checking authorization');
          setSession(newSession);
          await checkAuthorization(newSession.user.id);
        } else {
          // No session found after restoration attempt - redirect to auth
          console.log('[RoleProtectedRoute] No session after INITIAL_SESSION, redirecting to /auth');
          setLoading(false);
          navigate("/auth", { replace: true });
        }
        return;
      }

      // Handle sign out
      if (event === 'SIGNED_OUT' || !newSession) {
        setSession(null);
        setAuthorized(false);
        setLoading(false);
        navigate("/auth", { replace: true });
        return;
      }

      // Handle sign in or token refresh
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        console.log('[RoleProtectedRoute] Session updated via', event);
        setSession(newSession);
        await checkAuthorization(newSession.user.id);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate, requiredRole, location.pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-destructive/5 p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto p-4 rounded-full bg-destructive/10 w-fit">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-12 w-12 text-destructive" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground mb-2">No Access</h1>
            <p className="text-muted-foreground">
              {requiredRole === "admin" 
                ? "This area is restricted to administrators only. Your account does not have admin privileges."
                : requiredRole === "coach"
                ? "This area is for coaches only. Admins must use a separate coach account."
                : "You don't have permission to view this page."
              }
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            If you believe this is an error, please contact support.
          </p>
        </div>
      </div>
    );
  }

  return <div className="animate-fade-in">{children}</div>;
}
