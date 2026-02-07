import { useMemo } from "react";
import { useUserSubroles } from "@/hooks/useUserSubroles";
import { hasCapability } from "@/auth/roles";
import type { SubroleSlug } from "@/auth/roles";

interface SubrolePermissions {
  /** Can build workout programs (coach, physiotherapist, mobility_coach) */
  canBuildPrograms: boolean;
  /** Can assign workouts to clients (delegates to canBuildPrograms) */
  canAssignWorkouts: boolean;
  /** Can edit nutrition when no dietitian is assigned */
  canEditNutritionIfNoDietitian: boolean;
  /** Can override coach nutrition plans (dietitian only) */
  canEditNutritionOverride: boolean;
  /** Can write injury assessment notes (physiotherapist only) */
  canWriteInjuryNotes: boolean;
  /** Can write sports psychology notes (sports_psychologist only) */
  canWritePsychNotes: boolean;
  /** Subrole identity checks */
  isDietitian: boolean;
  isPhysiotherapist: boolean;
  isSportsPhysiologist: boolean;
  isMobilityCoach: boolean;
  /** The user's approved subrole slugs */
  approvedSlugs: SubroleSlug[];
  /** Loading state */
  isLoading: boolean;
}

/**
 * Wraps useUserSubroles with computed capability booleans.
 * Use this in components that need to gate features by subrole.
 */
export function useSubrolePermissions(userId?: string): SubrolePermissions {
  const { approvedSlugs, isLoading } = useUserSubroles(userId);

  return useMemo(() => ({
    canBuildPrograms: hasCapability(approvedSlugs, "canBuildPrograms"),
    canAssignWorkouts: hasCapability(approvedSlugs, "canAssignWorkouts"),
    canEditNutritionIfNoDietitian: hasCapability(approvedSlugs, "canEditNutritionIfNoDietitian"),
    canEditNutritionOverride: hasCapability(approvedSlugs, "canEditNutritionOverride"),
    canWriteInjuryNotes: hasCapability(approvedSlugs, "canWriteInjuryNotes"),
    canWritePsychNotes: hasCapability(approvedSlugs, "canWritePsychNotes"),
    isDietitian: approvedSlugs.includes("dietitian"),
    isPhysiotherapist: approvedSlugs.includes("physiotherapist"),
    isSportsPhysiologist: approvedSlugs.includes("sports_psychologist"),
    isMobilityCoach: approvedSlugs.includes("mobility_coach"),
    approvedSlugs,
    isLoading,
  }), [approvedSlugs, isLoading]);
}
