/**
 * ============================================================================
 * ONBOARDING STATE MACHINE
 * ============================================================================
 * 
 * Deterministic client/coach onboarding with clear status transitions.
 * A user cannot access protected content until they reach 'active' status.
 * 
 * This module defines:
 * - Status enums for clients and coaches
 * - Status transition rules
 * - Redirect logic based on current status
 * - Validation helpers
 * ============================================================================
 */

// =============================================================================
// CLIENT ONBOARDING STATUSES
// =============================================================================

/**
 * Client account statuses — matches the database `account_status` enum
 * 1:1 (verified May 2026). Order roughly follows the typical onboarding
 * progression. If you add or remove a value here, mirror the change in a
 * Postgres migration (`ALTER TYPE account_status ADD VALUE …`).
 *
 * `'new'` is intentionally NOT in this list — it has never been a valid
 * `account_status` enum value. The DB-default initial state is `'pending'`
 * (set on profiles_public INSERT). See CLAUDE.md "Column and enum names
 * that have tripped past fixes".
 */
export type ClientStatus =
  | "pending"                // DB-default initial state; intake form not yet submitted
  | "needs_medical_review"   // PAR-Q flagged medical concerns
  | "pending_coach_approval" // Medical cleared, awaiting coach assignment
  | "pending_payment"        // Approved, awaiting payment
  | "approved"               // Legacy DB value — treat as alias for pending_payment
  | "active"                 // Fully onboarded, can access dashboard
  | "inactive"               // Temporarily inactive (grace period ended)
  | "suspended"              // Admin suspended (payment issues, etc.)
  | "cancelled"              // User cancelled subscription
  | "expired";               // Subscription expired

/**
 * Client statuses that block dashboard access.
 * Users in these states must complete onboarding first.
 */
export const BLOCKED_CLIENT_STATUSES: ClientStatus[] = [
  "pending",
  "needs_medical_review",
  "pending_coach_approval",
  "pending_payment",
  "approved", // Legacy, treat as pending_payment
];

/**
 * Client statuses that allow limited dashboard access.
 * Users can see their status but cannot access all features.
 */
export const LIMITED_ACCESS_STATUSES: ClientStatus[] = [
  "inactive",
  "suspended",
  "cancelled",
  "expired",
];

/**
 * Check if a client status blocks full dashboard access.
 */
export function isOnboardingIncomplete(status: ClientStatus | string | null): boolean {
  if (!status) return true;
  return BLOCKED_CLIENT_STATUSES.includes(status as ClientStatus);
}

/**
 * Check if a client has limited access (can see dashboard but with restrictions).
 */
export function hasLimitedAccess(status: ClientStatus | string | null): boolean {
  if (!status) return false;
  return LIMITED_ACCESS_STATUSES.includes(status as ClientStatus);
}

/**
 * Check if a client is fully active.
 */
export function isFullyActive(status: ClientStatus | string | null): boolean {
  return status === "active";
}

// =============================================================================
// COACH ONBOARDING STATUSES
// =============================================================================

export type CoachStatus =
  | "invited"         // Admin created, pending password setup
  | "pending_profile" // Password set, profile incomplete
  | "pending_payout"  // Profile done, payout details needed
  | "active"          // Fully onboarded
  | "suspended"       // Admin suspended
  | "inactive";       // No longer active

export const BLOCKED_COACH_STATUSES: CoachStatus[] = [
  "invited",
  "pending_profile",
  "pending_payout",
];

export function isCoachOnboardingIncomplete(status: CoachStatus | string | null): boolean {
  if (!status) return true;
  return BLOCKED_COACH_STATUSES.includes(status as CoachStatus);
}

// =============================================================================
// ONBOARDING STEP DEFINITIONS
// =============================================================================

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  route: string;
  /** Status that indicates this step is in progress */
  activeStatuses: ClientStatus[];
  /** Status that indicates this step is complete */
  completedWhen: (status: ClientStatus) => boolean;
}

/**
 * Client onboarding steps in order.
 */
export const CLIENT_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "account",
    label: "Create Account",
    description: "Sign up for an account",
    route: "/auth?mode=signup",
    activeStatuses: [],
    completedWhen: () => true, // Always complete if user exists
  },
  {
    id: "intake",
    label: "Complete Intake Form",
    description: "Tell us about yourself and your goals",
    route: "/onboarding",
    activeStatuses: ["pending"],
    // Once the profile row exists at all, status is at least 'pending', so
    // intake is considered complete from a step-progression perspective.
    // (Previous version excluded the phantom 'new' status — see commit
    // dropping `'new'` from ClientStatus.)
    completedWhen: () => true,
  },
  {
    id: "medical",
    label: "Medical Review",
    description: "PAR-Q health assessment",
    route: "/onboarding/medical-review",
    activeStatuses: ["needs_medical_review"],
    completedWhen: (s) => !["pending", "needs_medical_review"].includes(s),
  },
  {
    id: "approval",
    label: "Coach Assignment",
    description: "Get matched with your coach",
    route: "/onboarding/awaiting-approval",
    activeStatuses: ["pending_coach_approval"],
    completedWhen: (s) => !["pending", "needs_medical_review", "pending_coach_approval"].includes(s),
  },
  {
    id: "payment",
    label: "Complete Payment",
    description: "Set up your subscription",
    route: "/onboarding/payment",
    activeStatuses: ["pending_payment", "approved"],
    completedWhen: (s) => s === "active",
  },
];

/**
 * Get the current onboarding step for a client.
 */
export function getCurrentOnboardingStep(status: ClientStatus | string | null): OnboardingStep | null {
  if (!status) return CLIENT_ONBOARDING_STEPS[1]; // Intake form
  
  for (const step of CLIENT_ONBOARDING_STEPS) {
    if (step.activeStatuses.includes(status as ClientStatus)) {
      return step;
    }
  }
  
  return null; // No active step (user is past onboarding or in error state)
}

/**
 * Get the redirect URL for a client based on their status.
 * Returns null if no redirect needed (user can access dashboard).
 */
export function getOnboardingRedirect(status: ClientStatus | string | null): string | null {
  if (!status) return "/onboarding";
  
  const step = getCurrentOnboardingStep(status);
  if (step) {
    return step.route;
  }
  
  // Limited access statuses - redirect to dashboard with status shown
  if (hasLimitedAccess(status as ClientStatus)) {
    return null; // Allow dashboard access (with restrictions)
  }
  
  // Active - no redirect needed
  if (isFullyActive(status)) {
    return null;
  }
  
  // Unknown status - redirect to onboarding to be safe
  return "/onboarding";
}

/**
 * Calculate onboarding progress percentage.
 */
export function getOnboardingProgress(status: ClientStatus | string | null): number {
  if (!status) return 0;
  
  const stepIndex = CLIENT_ONBOARDING_STEPS.findIndex(
    step => step.activeStatuses.includes(status as ClientStatus)
  );
  
  if (stepIndex === -1) {
    // Check if fully complete
    if (isFullyActive(status) || hasLimitedAccess(status as ClientStatus)) {
      return 100;
    }
    return 0;
  }
  
  // Calculate percentage based on completed steps
  return Math.round((stepIndex / CLIENT_ONBOARDING_STEPS.length) * 100);
}

// =============================================================================
// STATUS TRANSITIONS (for validation)
// =============================================================================

/**
 * Valid status transitions for clients.
 * Key is current status, value is array of valid next statuses.
 */
export const CLIENT_STATUS_TRANSITIONS: Record<ClientStatus, ClientStatus[]> = {
  // 'pending' is the DB-default initial state — there is no transition INTO
  // 'pending' from a fresher state, only re-entry from cancelled/expired.
  pending: ["needs_medical_review", "pending_coach_approval", "pending_payment"],
  needs_medical_review: ["pending_coach_approval", "cancelled"],
  pending_coach_approval: ["pending_payment", "cancelled"],
  pending_payment: ["active", "cancelled"],
  approved: ["active", "cancelled"], // Legacy
  active: ["suspended", "cancelled", "expired", "inactive"],
  inactive: ["active", "suspended", "cancelled"],
  suspended: ["active", "cancelled"],
  cancelled: ["pending"], // Can re-onboard
  expired: ["pending", "active"], // Can renew
};

/**
 * Check if a status transition is valid.
 */
export function isValidTransition(from: ClientStatus, to: ClientStatus): boolean {
  const validNextStatuses = CLIENT_STATUS_TRANSITIONS[from];
  return validNextStatuses?.includes(to) ?? false;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

export interface StatusChangeEvent {
  userId: string;
  fromStatus: string | null;
  toStatus: string;
  changedBy: string; // User ID of admin or 'system'
  reason?: string;
  timestamp: Date;
}

/**
 * Log a status change event to the admin_audit_log table.
 */
export async function logStatusChange(event: StatusChangeEvent): Promise<void> {
  if (import.meta.env.DEV) console.log("[OnboardingAudit]", {
    ...event,
    timestamp: event.timestamp.toISOString(),
  });

  try {
    const { logOnboardingStatusChange } = await import("@/lib/auditLog");
    await logOnboardingStatusChange(
      event.userId,
      event.fromStatus,
      event.toStatus,
      event.reason
    );
  } catch (err) {
    if (import.meta.env.DEV) console.error("[OnboardingAudit] Failed to write audit log:", err);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export const OnboardingStatuses = {
  isOnboardingIncomplete,
  hasLimitedAccess,
  isFullyActive,
  isCoachOnboardingIncomplete,
  getCurrentOnboardingStep,
  getOnboardingRedirect,
  getOnboardingProgress,
  isValidTransition,
  logStatusChange,
};

export default OnboardingStatuses;
