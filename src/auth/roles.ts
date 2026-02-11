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
// PROFESSIONAL LEVELS — Experience tiers within subroles (admin-assigned)
// ============================================================================
//
// Hierarchy (4 layers + Head Coach flag):
//   1. Core Role    — admin | coach | client — gates route access
//   2. Subrole      — Coach, Dietitian, Physio, etc. — admin-approved credentials
//   3. Level        — Junior | Senior | Lead — admin-assigned experience tier (NEW)
//   4. Tags         — Bodybuilding, Powerlifting, etc. — self-service marketing labels
//   + Head Coach    — boolean flag for team plan leadership (independent of all above)
//
// Key rules:
//   - Levels are admin-set ONLY, never self-assigned, never automatic.
//   - Default level for all newly approved professionals is Junior.
//   - Promotion is based on admin performance review.
//   - Levels affect payout calculations but NOT client-facing pricing.
//

/**
 * Professional level enum — matches DB `professional_level` enum.
 */
export type ProfessionalLevel = "junior" | "senior" | "lead";

/**
 * Professional role enum — matches DB `professional_role` enum.
 * Distinct from SubroleSlug: this is used for compensation calculations only.
 */
export type ProfessionalRole = "coach" | "dietitian";

/**
 * Work type category — matches DB `work_type_category` enum.
 */
export type WorkTypeCategory = "online" | "in_person";

/**
 * Coach hourly rates by level (KWD/hr).
 * Source of truth is DB `professional_levels` table; this is for client-side reference.
 */
export const COACH_RATES: Record<ProfessionalLevel, { online: number; in_person: number }> = {
  junior: { online: 4, in_person: 8 },
  senior: { online: 6, in_person: 12 },
  lead:   { online: 8, in_person: 15 },
};

/**
 * Dietitian hourly rates by level (KWD/hr). Online only.
 */
export const DIETITIAN_RATES: Record<ProfessionalLevel, number> = {
  junior: 5,
  senior: 7,
  lead:   9,
};

/**
 * Professional level display labels.
 */
export const LEVEL_LABELS: Record<ProfessionalLevel, string> = {
  junior: "Junior",
  senior: "Senior",
  lead: "Lead",
};

/**
 * Service tier slugs — matches DB `services.slug` column.
 */
export type ServiceSlug =
  | "team_fe_squad"
  | "team_bunz"
  | "one_to_one_online"
  | "one_to_one_complete"
  | "hybrid"
  | "in_person";

/**
 * Level eligibility per tier.
 * Some combinations are blocked because they'd push IGU profit below 5 KWD.
 */
export const LEVEL_ELIGIBILITY: Record<ServiceSlug, {
  coach: ProfessionalLevel[];
  maxDietitianWithLeadCoach?: ProfessionalLevel;
  notes?: string;
}> = {
  team_fe_squad:       { coach: [], notes: "Team plans use Head Coach, not level system" },
  team_bunz:           { coach: [], notes: "Team plans use Head Coach, not level system" },
  one_to_one_online:   { coach: ["junior", "senior"], notes: "Lead Coach not eligible (budget too tight)" },
  one_to_one_complete: { coach: ["junior", "senior", "lead"], maxDietitianWithLeadCoach: "senior", notes: "Lead+Lead blocked (exceeds budget)" },
  hybrid:              { coach: ["junior", "senior", "lead"] },
  in_person:           { coach: ["junior", "senior", "lead"] },
};

/**
 * Minimum IGU profit guardrail (KWD).
 * Assignments that would result in less than this are blocked.
 */
export const MIN_IGU_PROFIT_KWD = 5;

/**
 * Maximum discount percentage without admin override.
 */
export const MAX_DISCOUNT_PERCENT = 30;

/**
 * Head Coach fixed payout per team plan client (KWD/month).
 */
export const HEAD_COACH_TEAM_PAYOUT_KWD = 5;

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
