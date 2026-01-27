import { useMemo } from "react";

/**
 * Grace Period Access Control Hook
 * 
 * Defines what clients CAN and CANNOT do during the grace period (past_due status).
 * This is the single source of truth for grace period access rules.
 * 
 * During grace period (Day 1-7 after billing due date):
 * - subscription.status = 'past_due'
 * - profile.status = 'active' (remains active)
 * 
 * CAN do:
 * - View workouts
 * - Access programs
 * - Submit check-ins
 * - Message coaches
 * - View nutrition
 * 
 * CANNOT do:
 * - Book new sessions
 * - Add care team members
 * - Upgrade plans
 * - Add paid add-ons
 */

export interface GracePeriodAccessState {
  // Current status
  isInGracePeriod: boolean;
  isHardLocked: boolean; // subscription + profile both inactive
  
  // Grace period details
  daysRemaining: number | null;
  graceDeadline: Date | null;
  
  // Allowed actions during grace
  canViewWorkouts: boolean;
  canViewNutrition: boolean;
  canSubmitCheckIns: boolean;
  canMessageCoach: boolean;
  canViewPrograms: boolean;
  
  // Blocked actions during grace
  canBookSessions: boolean;
  canAddCareTeam: boolean;
  canUpgradePlan: boolean;
  canAddAddons: boolean;
  canAccessBilling: boolean; // Always true even when hard locked
}

interface UseGracePeriodAccessParams {
  profileStatus: string | null;
  subscriptionStatus: string | null;
  pastDueSince: string | null;
  gracePeriodDays?: number;
}

export function useGracePeriodAccess({
  profileStatus,
  subscriptionStatus,
  pastDueSince,
  gracePeriodDays = 7,
}: UseGracePeriodAccessParams): GracePeriodAccessState {
  return useMemo(() => {
    const now = new Date();
    
    // Calculate grace period details
    let daysRemaining: number | null = null;
    let graceDeadline: Date | null = null;
    
    if (pastDueSince) {
      const pastDueDate = new Date(pastDueSince);
      graceDeadline = new Date(pastDueDate);
      graceDeadline.setDate(graceDeadline.getDate() + gracePeriodDays);
      
      daysRemaining = Math.max(0, Math.ceil((graceDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }
    
    // Determine states
    const isInGracePeriod = subscriptionStatus === "past_due" && profileStatus === "active";
    const isHardLocked = 
      (subscriptionStatus === "inactive" || profileStatus === "inactive") ||
      (profileStatus === "suspended");
    
    // Active state - full access
    const isFullyActive = profileStatus === "active" && subscriptionStatus === "active";
    
    // Grace period access rules
    if (isHardLocked) {
      return {
        isInGracePeriod: false,
        isHardLocked: true,
        daysRemaining: null,
        graceDeadline: null,
        // All blocked except billing
        canViewWorkouts: false,
        canViewNutrition: false,
        canSubmitCheckIns: false,
        canMessageCoach: false,
        canViewPrograms: false,
        canBookSessions: false,
        canAddCareTeam: false,
        canUpgradePlan: false,
        canAddAddons: false,
        canAccessBilling: true, // Always allow billing access
      };
    }
    
    if (isInGracePeriod) {
      return {
        isInGracePeriod: true,
        isHardLocked: false,
        daysRemaining,
        graceDeadline,
        // Allowed during grace
        canViewWorkouts: true,
        canViewNutrition: true,
        canSubmitCheckIns: true,
        canMessageCoach: true,
        canViewPrograms: true,
        // Blocked during grace
        canBookSessions: false,
        canAddCareTeam: false,
        canUpgradePlan: false,
        canAddAddons: false,
        canAccessBilling: true,
      };
    }
    
    // Fully active - all access
    if (isFullyActive) {
      return {
        isInGracePeriod: false,
        isHardLocked: false,
        daysRemaining: null,
        graceDeadline: null,
        canViewWorkouts: true,
        canViewNutrition: true,
        canSubmitCheckIns: true,
        canMessageCoach: true,
        canViewPrograms: true,
        canBookSessions: true,
        canAddCareTeam: true,
        canUpgradePlan: true,
        canAddAddons: true,
        canAccessBilling: true,
      };
    }
    
    // Default: no access (pending, needs_medical_review, etc.)
    return {
      isInGracePeriod: false,
      isHardLocked: false,
      daysRemaining: null,
      graceDeadline: null,
      canViewWorkouts: false,
      canViewNutrition: false,
      canSubmitCheckIns: false,
      canMessageCoach: false,
      canViewPrograms: false,
      canBookSessions: false,
      canAddCareTeam: false,
      canUpgradePlan: false,
      canAddAddons: false,
      canAccessBilling: false,
    };
  }, [profileStatus, subscriptionStatus, pastDueSince, gracePeriodDays]);
}

/**
 * Helper to get user-friendly message for blocked actions during grace period
 */
export function getGracePeriodBlockedMessage(action: string): string {
  return `This action is temporarily unavailable. Your payment is past due. Please renew your subscription to ${action.toLowerCase()}.`;
}
