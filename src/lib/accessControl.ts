/**
 * ============================================================================
 * ACCESS CONTROL MATRIX
 * ============================================================================
 * 
 * This file serves as the single source of truth for role-based access control
 * across the IGU application. It defines which roles can access which routes,
 * features, and data.
 * 
 * CRITICAL SECURITY RULES:
 * 1. Coaches MUST NEVER access Admin routes
 * 2. Admins CANNOT use coach routes (must use separate coach account)
 * 3. Clients can only access client-specific routes
 * 4. All role checks must go through the centralized hooks
 * 
 * NOTE: Route configuration is now centralized in src/lib/routeConfig.ts
 * This file maintains backward compatibility and re-exports key functions.
 * ============================================================================
 */

import { 
  isRouteBlockedForRole,
  getPrimaryDashboardForRole,
  AppRole as RouteAppRole,
} from "./routeConfig";

export type AppRole = "admin" | "coach" | "client";

/**
 * Route access permissions by role
 */
export const ROUTE_PERMISSIONS: Record<string, AppRole[]> = {
  // Admin-only routes (coaches are BLOCKED)
  "/admin": ["admin"],
  "/admin/dashboard": ["admin"],
  "/admin/clients": ["admin"],
  "/admin/coaches": ["admin"],
  "/admin/pricing-payouts": ["admin"],
  "/admin/content": ["admin"],
  "/admin/system-health": ["admin"],
  "/admin/billing": ["admin"],
  "/admin/discounts": ["admin"],
  "/admin/launch-checklist": ["admin"],
  "/admin/workout-qa": ["admin"],
  "/admin/client-diagnostics": ["admin"],
  "/admin/email-log": ["admin"],

  // Coach-only routes (admins must use separate coach account)
  "/coach": ["coach"],
  "/coach/dashboard": ["coach"],
  "/coach/clients": ["coach"],
  "/coach/my-clients": ["coach"],
  "/coach/pending-clients": ["coach"],
  "/coach/payouts": ["coach"],
  "/coach/profile": ["coach"],
  "/coach/sessions": ["coach"],
  "/coach/programs": ["coach"],

  // Client routes (no admin/coach access)
  "/client": ["client"],
  "/client/dashboard": ["client"],
  "/dashboard": ["client"], // Legacy route
  "/billing/pay": ["client"],
  "/sessions": ["client"],
  "/nutrition-client": ["client"],

  // Shared authenticated routes (all roles)
  "/account": ["admin", "coach", "client"],
  "/workout-library": ["admin", "coach", "client"],
  "/educational-videos": ["admin", "coach", "client"],
  "/nutrition": ["admin", "coach", "client"],
  "/nutrition-team": ["admin", "coach", "client"],
};

/**
 * Routes that are completely blocked for specific roles
 * Key = blocked role, Value = array of blocked route patterns
 */
export const BLOCKED_ROUTES: Record<AppRole, string[]> = {
  admin: [
    "/coach",
    "/coach/dashboard",
    "/coach/clients",
    "/coach/my-clients",
    "/coach/pending-clients",
    "/coach/payouts",
    "/coach/profile",
    "/coach/sessions",
    "/coach/programs",
  ],
  coach: [
    "/admin",
    "/admin/dashboard",
    "/admin/clients",
    "/admin/coaches",
    "/admin/pricing-payouts",
    "/admin/content",
    "/admin/system-health",
    "/admin/billing",
    "/admin/discounts",
    "/admin/launch-checklist",
    "/admin/client-diagnostics",
    "/admin/email-log",
  ],
  client: [
    "/admin",
    "/coach",
  ],
};

/**
 * Feature permissions by role
 */
export const FEATURE_PERMISSIONS = {
  // PHI/PII Access
  viewPHI: ["admin"] as AppRole[],
  viewPII: ["admin"] as AppRole[],
  editMedicalData: ["admin"] as AppRole[],
  
  // Client Management
  viewAllClients: ["admin"] as AppRole[],
  viewAssignedClients: ["admin", "coach"] as AppRole[],
  approveClients: ["admin", "coach"] as AppRole[],
  manageSubscriptions: ["admin"] as AppRole[],
  
  // Coach Management
  viewAllCoaches: ["admin"] as AppRole[],
  editCoachProfiles: ["admin"] as AppRole[],
  
  // Content Management
  manageWorkouts: ["admin", "coach"] as AppRole[],
  manageVideos: ["admin"] as AppRole[],
  manageTestimonials: ["admin"] as AppRole[],
  
  // Billing & Pricing
  editPricing: ["admin"] as AppRole[],
  viewPayouts: ["admin", "coach"] as AppRole[],
  manageDiscounts: ["admin"] as AppRole[],
  
  // System
  viewSystemHealth: ["admin"] as AppRole[],
  viewAuditLogs: ["admin"] as AppRole[],
  runSecurityChecks: ["admin"] as AppRole[],
};

/**
 * Get the primary dashboard route for a given role
 */
export function getPrimaryDashboard(role: AppRole): string {
  return getPrimaryDashboardForRole(role as RouteAppRole);
}

/**
 * Check if a route is blocked for a specific role
 */
export function isRouteBlocked(route: string, role: AppRole): boolean {
  return isRouteBlockedForRole(route, role as RouteAppRole);
}

/**
 * Check if a role has permission for a specific feature
 */
export function hasFeaturePermission(feature: keyof typeof FEATURE_PERMISSIONS, role: AppRole): boolean {
  const allowedRoles = FEATURE_PERMISSIONS[feature];
  return allowedRoles?.includes(role) || false;
}

/**
 * Get the role that should be used for a given route
 */
export function getRequiredRoleForRoute(route: string): AppRole | null {
  // Check exact match first
  if (ROUTE_PERMISSIONS[route]) {
    return ROUTE_PERMISSIONS[route][0] || null;
  }
  
  // Check prefix matches
  if (route.startsWith("/admin")) return "admin";
  if (route.startsWith("/coach")) return "coach";
  if (route.startsWith("/client") || route.startsWith("/dashboard")) return "client";
  
  return null;
}

/**
 * Violation log entry for security monitoring
 */
export interface AccessViolation {
  timestamp: Date;
  userId: string | null;
  attemptedRole: AppRole;
  actualRoles: AppRole[];
  route: string;
  action: "blocked" | "logged";
  userAgent?: string;
}

/**
 * Log access violation for security monitoring
 * In production, this should send to a logging service
 */
export function logAccessViolation(violation: AccessViolation): void {
  console.error("[ACCESS VIOLATION]", {
    timestamp: violation.timestamp.toISOString(),
    userId: violation.userId,
    attemptedRoute: violation.route,
    attemptedRole: violation.attemptedRole,
    actualRoles: violation.actualRoles,
    action: violation.action,
  });
  
  // In production, send to logging service or Supabase audit log
  // This is intentionally client-side logging for immediate feedback
}
