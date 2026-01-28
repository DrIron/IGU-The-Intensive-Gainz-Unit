import { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Role,
  isRouteBlocked,
  getDashboardForRole,
  logAccessViolation,
  hasPermission,
  PERMISSIONS,
  PermissionKey,
} from "@/auth/roles";

// Alias for backward compatibility
type AppRole = Role;

export interface RoleGateState {
  // Role flags
  isAdmin: boolean;
  isCoach: boolean;
  isClient: boolean;
  
  // Loading state
  loading: boolean;
  
  // Authorization result
  authorized: boolean;
  
  // User info
  userId: string | null;
  roles: AppRole[];
  
  // Primary role (for redirects)
  primaryRole: AppRole;
  
  // Helper methods
  canAccess: (feature: PermissionKey) => boolean;
  redirectToDashboard: () => void;
}

interface UseRoleGateOptions {
  requiredRole?: AppRole;
  redirectOnFail?: boolean;
  logViolations?: boolean;
}

/**
 * Centralized role gate hook for access control.
 * 
 * Features:
 * - Checks user roles from database
 * - Validates route access based on Access Control Matrix
 * - Logs violations for security monitoring
 * - Provides friendly redirects and error messages
 * 
 * @param options - Configuration options
 * @returns RoleGateState with role info and authorization status
 */
export function useRoleGate(options: UseRoleGateOptions = {}): RoleGateState {
  const {
    requiredRole,
    redirectOnFail = true,
    logViolations = true,
  } = options;

  const navigate = useNavigate();
  const location = useLocation();

  const [state, setState] = useState<RoleGateState>({
    isAdmin: false,
    isCoach: false,
    isClient: true,
    loading: true,
    authorized: false,
    userId: null,
    roles: [],
    primaryRole: "client",
    canAccess: () => false,
    redirectToDashboard: () => {},
  });

  const redirectToDashboard = useCallback(() => {
    const dashboard = getDashboardForRole(state.primaryRole);
    navigate(dashboard, { replace: true });
  }, [navigate, state.primaryRole]);

  const canAccess = useCallback((feature: PermissionKey): boolean => {
    return hasPermission(state.roles, feature);
  }, [state.roles]);

  useEffect(() => {
    let mounted = true;

    const checkAuthorization = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          if (mounted) {
            setState(prev => ({
              ...prev,
              loading: false,
              authorized: false,
            }));
          }
          if (redirectOnFail) {
            navigate("/auth", { replace: true });
          }
          return;
        }

        // Fetch roles from database
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const roles = (rolesData?.map(r => r.role as AppRole)) || [];
        const isAdmin = roles.includes("admin");
        const isCoach = roles.includes("coach");
        const isClient = !isAdmin && !isCoach;

        // Determine primary role for redirects
        const primaryRole: AppRole = isAdmin ? "admin" : isCoach ? "coach" : "client";

        // Check if current route is blocked for user's role
        const currentPath = location.pathname;
        let isBlocked = false;

        for (const role of roles) {
          if (isRouteBlocked(currentPath, role)) {
            isBlocked = true;
            break;
          }
        }

        // Special case: If user is ONLY a coach (not admin), block admin routes
        if (isCoach && !isAdmin && currentPath.startsWith("/admin")) {
          isBlocked = true;
        }

        // Special case: If user is ONLY an admin (not coach), block coach routes
        if (isAdmin && !isCoach && currentPath.startsWith("/coach")) {
          isBlocked = true;
        }

        // Check required role
        let authorized = true;
        if (requiredRole) {
          switch (requiredRole) {
            case "admin":
              authorized = isAdmin;
              break;
            case "coach":
              authorized = isCoach;
              break;
            case "client":
              authorized = isClient;
              break;
          }
        }

        // If blocked or unauthorized, handle it
        if (isBlocked || !authorized) {
          if (logViolations) {
            logAccessViolation({
              timestamp: new Date(),
              userId: user.id,
              attemptedRole: requiredRole || primaryRole,
              actualRoles: roles,
              route: currentPath,
              action: "blocked",
              userAgent: navigator.userAgent,
            });
          }

          if (mounted) {
            setState({
              isAdmin,
              isCoach,
              isClient,
              loading: false,
              authorized: false,
              userId: user.id,
              roles,
              primaryRole,
              canAccess: (feature: PermissionKey) => hasPermission(roles, feature),
              redirectToDashboard: () => navigate(getDashboardForRole(primaryRole), { replace: true }),
            });
          }

          if (redirectOnFail) {
            toast.error("Access Denied", {
              description: getAccessDeniedMessage(primaryRole, requiredRole),
            });
            navigate(getDashboardForRole(primaryRole), { replace: true });
          }
          return;
        }

        // Authorized
        if (mounted) {
          setState({
            isAdmin,
            isCoach,
            isClient,
            loading: false,
            authorized: true,
            userId: user.id,
            roles,
            primaryRole,
            canAccess: (feature: PermissionKey) => hasPermission(roles, feature),
            redirectToDashboard: () => navigate(getDashboardForRole(primaryRole), { replace: true }),
          });
        }
      } catch (error) {
        console.error("Error in useRoleGate:", error);
        if (mounted) {
          setState(prev => ({
            ...prev,
            loading: false,
            authorized: false,
          }));
        }
        if (redirectOnFail) {
          navigate("/auth", { replace: true });
        }
      }
    };

    checkAuthorization();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuthorization();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate, location.pathname, requiredRole, redirectOnFail, logViolations]);

  return {
    ...state,
    canAccess,
    redirectToDashboard,
  };
}

/**
 * Get a user-friendly access denied message
 */
function getAccessDeniedMessage(userRole: AppRole, requiredRole?: AppRole): string {
  if (userRole === "coach" && requiredRole === "admin") {
    return "This area is restricted to administrators only.";
  }
  if (userRole === "admin" && requiredRole === "coach") {
    return "Admins must use a separate coach account to access coach features.";
  }
  if (requiredRole === "client") {
    return "This page is for clients only.";
  }
  return "You don't have permission to access this page.";
}

/**
 * Hook to check a specific feature permission without route validation
 */
export function useFeatureAccess(feature: PermissionKey): boolean {
  const { roles, loading } = useRoleGate({ redirectOnFail: false });
  
  if (loading) return false;
  return hasPermission(roles, feature);
}
