/**
 * ============================================================================
 * CANONICAL ROLE DEFINITIONS
 * ============================================================================
 * 
 * SINGLE SOURCE OF TRUTH for all role-based access control in the IGU app.
 * 
 * All other files MUST import Role and permissions from this file.
 * DO NOT define Role types elsewhere.
 * 
 * SECURITY RULES:
 * 1. Coaches MUST NEVER access Admin routes
 * 2. Admins CANNOT use coach routes (must use separate coach account)
 * 3. Clients can only access client-specific routes
 * 4. All role checks must use the functions exported from this file
 * ============================================================================
 */

/**
 * Application roles - the three core user types.
 * Use this type everywhere instead of string literals.
 */
export type Role = "admin" | "coach" | "client";

/**
 * Extended role type that includes auth states for route configuration.
 */
export type AppRole = Role | "authenticated" | "public";

/**
 * Role precedence for multi-role users (higher = more privileged).
 * When a user has multiple roles, use the highest-precedence role for access decisions.
 */
export const ROLE_PRECEDENCE: Record<Role, number> = {
  admin: 3,
  coach: 2,
  client: 1,
};

/**
 * Get the primary (highest precedence) role from a list of roles.
 * Returns "client" if no roles are provided.
 */
export function getPrimaryRole(roles: Role[]): Role {
  if (roles.length === 0) return "client";
  
  return roles.reduce((primary, role) => {
    return ROLE_PRECEDENCE[role] > ROLE_PRECEDENCE[primary] ? role : primary;
  }, roles[0]);
}

/**
 * Check if a user has a specific role.
 */
export function hasRole(roles: Role[], role: Role): boolean {
  return roles.includes(role);
}

/**
 * Check if user is admin.
 */
export function isAdmin(roles: Role[]): boolean {
  return roles.includes("admin");
}

/**
 * Check if user is coach (and NOT admin).
 */
export function isCoachOnly(roles: Role[]): boolean {
  return roles.includes("coach") && !roles.includes("admin");
}

/**
 * Check if user is client (no admin or coach role).
 */
export function isClientOnly(roles: Role[]): boolean {
  return !roles.includes("admin") && !roles.includes("coach");
}

// ============================================================================
// FEATURE PERMISSIONS MATRIX
// ============================================================================

/**
 * All permission keys available in the application.
 */
export type PermissionKey =
  // PHI/PII Access
  | "viewPHI"
  | "viewPII"
  | "editMedicalData"
  // Client Management
  | "viewAllClients"
  | "viewAssignedClients"
  | "approveClients"
  | "manageSubscriptions"
  // Coach Management
  | "viewAllCoaches"
  | "editCoachProfiles"
  // Content Management
  | "manageWorkouts"
  | "manageVideos"
  | "manageTestimonials"
  // Billing & Pricing
  | "editPricing"
  | "viewPayouts"
  | "manageDiscounts"
  // System
  | "viewSystemHealth"
  | "viewAuditLogs"
  | "runSecurityChecks";

/**
 * Feature permissions matrix: which roles can access which features.
 * This is the single source of truth for all permission checks.
 */
export const PERMISSIONS: Record<PermissionKey, Role[]> = {
  // PHI/PII Access - Admin only (except owner can view their own)
  viewPHI: ["admin"],
  viewPII: ["admin"],
  editMedicalData: ["admin"],

  // Client Management
  viewAllClients: ["admin"],
  viewAssignedClients: ["admin", "coach"],
  approveClients: ["admin", "coach"],
  manageSubscriptions: ["admin"],

  // Coach Management
  viewAllCoaches: ["admin"],
  editCoachProfiles: ["admin"],

  // Content Management
  manageWorkouts: ["admin", "coach"],
  manageVideos: ["admin"],
  manageTestimonials: ["admin"],

  // Billing & Pricing
  editPricing: ["admin"],
  viewPayouts: ["admin", "coach"],
  manageDiscounts: ["admin"],

  // System
  viewSystemHealth: ["admin"],
  viewAuditLogs: ["admin"],
  runSecurityChecks: ["admin"],
};

/**
 * Check if a user with given roles has a specific permission.
 */
export function hasPermission(roles: Role[], permission: PermissionKey): boolean {
  const allowedRoles = PERMISSIONS[permission];
  return roles.some(role => allowedRoles.includes(role));
}

/**
 * Check if a user can view PHI for a specific record.
 * Admins can view all PHI. Users can view their own PHI.
 */
export function canViewPHI(roles: Role[], userId: string | null, recordOwnerId: string): boolean {
  return hasPermission(roles, "viewPHI") || userId === recordOwnerId;
}

/**
 * Check if a user can edit medical data.
 * Only admins can edit medical data.
 */
export function canEditMedicalData(roles: Role[]): boolean {
  return hasPermission(roles, "editMedicalData");
}

// ============================================================================
// ROUTE BLOCKING
// ============================================================================

/**
 * Routes that are completely blocked for specific roles.
 * These are hard blocks - the user will be redirected, not just hidden UI.
 */
export const BLOCKED_ROUTE_PREFIXES: Record<Role, string[]> = {
  admin: ["/coach"],  // Admins must use separate coach account
  coach: ["/admin"],  // Coaches cannot access admin areas
  client: ["/admin", "/coach"],  // Clients cannot access admin or coach areas
};

/**
 * Check if a route is blocked for a user's primary role.
 */
export function isRouteBlocked(route: string, primaryRole: Role): boolean {
  const blockedPrefixes = BLOCKED_ROUTE_PREFIXES[primaryRole];
  return blockedPrefixes.some(prefix => route.startsWith(prefix));
}

/**
 * Get the primary dashboard route for a role.
 */
export function getDashboardForRole(role: Role): string {
  switch (role) {
    case "admin":
      return "/admin/dashboard";
    case "coach":
      return "/coach/dashboard";
    case "client":
    default:
      return "/dashboard";
  }
}

// ============================================================================
// SUBROLES — Credential-based capabilities within the "coach" core role
// ============================================================================

/**
 * Subrole slugs — admin-approved credential types.
 * All practitioners have the core "coach" role; subroles grant specific capabilities.
 */
export type SubroleSlug =
  | "coach"
  | "dietitian"
  | "physiotherapist"
  | "sports_psychologist"
  | "mobility_coach";

/**
 * Status of a user's subrole request.
 */
export type SubroleStatus = "pending" | "approved" | "rejected" | "revoked";

/**
 * A user's subrole record (from user_subroles joined with subrole_definitions).
 */
export interface UserSubrole {
  id: string;
  user_id: string;
  subrole_id: string;
  slug: SubroleSlug;
  display_name: string;
  status: SubroleStatus;
  credential_notes: string | null;
  credential_document_url: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  created_at: string;
}

/**
 * Capability keys that subroles grant.
 */
export type SubroleCapability =
  | "canBuildPrograms"
  | "canAssignWorkouts"
  | "canEditNutritionIfNoDietitian"
  | "canEditNutritionOverride"
  | "canWriteInjuryNotes"
  | "canWritePsychNotes";

/**
 * Maps each subrole to the capabilities it grants.
 */
export const SUBROLE_CAPABILITIES: Record<SubroleSlug, SubroleCapability[]> = {
  coach: ["canBuildPrograms", "canAssignWorkouts", "canEditNutritionIfNoDietitian"],
  dietitian: ["canEditNutritionOverride"],
  physiotherapist: ["canBuildPrograms", "canAssignWorkouts", "canWriteInjuryNotes"],
  sports_psychologist: ["canWritePsychNotes"],
  mobility_coach: ["canBuildPrograms", "canAssignWorkouts", "canEditNutritionIfNoDietitian"],
};

/**
 * Check if a set of approved subrole slugs grants a specific capability.
 */
export function hasCapability(approvedSlugs: SubroleSlug[], capability: SubroleCapability): boolean {
  return approvedSlugs.some(slug => SUBROLE_CAPABILITIES[slug]?.includes(capability));
}

// ============================================================================
// ACCESS VIOLATION LOGGING
// ============================================================================

/**
 * Access violation record for security monitoring.
 */
export interface AccessViolation {
  timestamp: Date;
  userId: string | null;
  attemptedRole: Role;
  actualRoles: Role[];
  route: string;
  action: "blocked" | "logged";
  userAgent?: string;
}

/**
 * Log an access violation for security monitoring.
 * Sends to Sentry + Supabase audit log via captureMessage.
 */
export function logAccessViolation(violation: AccessViolation): void {
  const details = {
    timestamp: violation.timestamp.toISOString(),
    userId: violation.userId,
    attemptedRoute: violation.route,
    attemptedRole: violation.attemptedRole,
    actualRoles: violation.actualRoles,
    action: violation.action,
    userAgent: violation.userAgent,
  };

  console.error("[ACCESS VIOLATION]", details);

  // Send to Sentry + Supabase security_audit_log (non-blocking)
  import('@/lib/errorLogging').then(({ captureMessage }) => {
    captureMessage(`Access violation: ${violation.action} at ${violation.route}`, {
      source: 'access_violation',
      severity: 'warning',
      userId: violation.userId ?? undefined,
      metadata: details,
      tags: ['security', 'access_violation'],
    });
  }).catch(() => {
    // Silently fail — console.error above is the fallback
  });
}
