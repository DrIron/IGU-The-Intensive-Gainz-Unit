/**
 * Hooks Index
 *
 * Centralized exports for all custom hooks
 */

// Auth Session Fix - Cache-first role management
export { useRoleCache } from './useRoleCache';
export { useAuthSession } from './useAuthSession';
export { useAuthCleanup } from './useAuthCleanup';

// Existing hooks - re-export for convenience
export { useUserRole, canViewPHI, canEditMedicalData } from './useUserRole';
export { useRoleGate, useFeatureAccess } from './useRoleGate';
export { useAuthNavigation } from './useAuthNavigation';
export { useClientAccess } from './useClientAccess';
export { useDocumentTitle } from './useDocumentTitle';
export { useToast, toast } from './use-toast';
export { useIsMobile } from './use-mobile';
