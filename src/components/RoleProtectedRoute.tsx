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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setSession(session);

      if (!session) {
        setLoading(false);
        navigate("/auth");
        return;
      }

      await checkAuthorization(session.user.id);
    });

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(session);

      if (!session) {
        setLoading(false);
        navigate("/auth");
        return;
      }

      await checkAuthorization(session.user.id);
    };

    const checkAuthorization = async (userId: string) => {
      if (!mounted) return;

      try {
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        const roles = rolesData?.map(r => r.role) || [];
        const isAdmin = roles.includes("admin");
        const isCoach = roles.includes("coach");
        const isClient = !isAdmin && !isCoach;
        const currentPath = location.pathname;

        // CRITICAL: Check if user's role is BLOCKED from this route
        const primaryRole: AppRole = isAdmin ? "admin" : isCoach ? "coach" : "client";
        
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
          
          if (mounted) {
            setAuthorized(false);
            setLoading(false);
          }
          return;
        }

        // Secondary check: explicit role requirement
        switch (requiredRole) {
          case "admin":
            if (isAdmin) {
              setAuthorized(true);
            } else {
              toast.error("Access Denied", {
                description: "Admin access required for this page."
              });
              if (isCoach) {
                navigate("/coach/dashboard", { replace: true });
              } else {
                navigate("/dashboard", { replace: true });
              }
            }
            break;

          case "coach":
            if (isCoach) {
              setAuthorized(true);
            } else {
              toast.error("Access Denied", {
                description: "Coach access required. Admins must use a separate coach account."
              });
              if (isAdmin) {
                navigate("/admin/dashboard", { replace: true });
              } else {
                navigate("/dashboard", { replace: true });
              }
            }
            break;

          case "client":
            if (isClient) {
              setAuthorized(true);
            } else {
              toast.error("Access Denied", {
                description: "This page is for clients only."
              });
              if (isAdmin) {
                navigate("/admin/dashboard", { replace: true });
              } else if (isCoach) {
                navigate("/coach/dashboard", { replace: true });
              }
            }
            break;
        }
      } catch (error) {
        console.error("Error checking authorization:", error);
        navigate("/dashboard", { replace: true });
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    checkAuth();

    return () => {
      mounted = false;
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
