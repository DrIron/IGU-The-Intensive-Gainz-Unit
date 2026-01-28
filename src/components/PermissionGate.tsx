import { ReactNode } from "react";
import { useRoleGate } from "@/hooks/useRoleGate";
import { PermissionKey } from "@/auth/roles";

interface PermissionGateProps {
  /**
   * The permission required to view the children.
   * Must be a key from the PERMISSIONS matrix in @/auth/roles.
   */
  permission: PermissionKey;
  
  /**
   * Content to show when user has permission.
   */
  children: ReactNode;
  
  /**
   * Optional fallback content when user doesn't have permission.
   * If not provided, nothing is rendered.
   */
  fallback?: ReactNode;
  
  /**
   * If true, shows a loading state while checking permissions.
   * Default: false (shows nothing while loading)
   */
  showLoading?: boolean;
}

/**
 * Permission-based content gate.
 * 
 * Use this to conditionally render UI based on user permissions.
 * Cleaner than ad-hoc `isAdmin ?` checks throughout components.
 * 
 * @example
 * ```tsx
 * // Only admins can see the pricing editor
 * <PermissionGate permission="editPricing">
 *   <PricingEditor />
 * </PermissionGate>
 * 
 * // Show different content for non-admins
 * <PermissionGate permission="viewAllClients" fallback={<p>You can only view your assigned clients.</p>}>
 *   <AllClientsTable />
 * </PermissionGate>
 * ```
 */
export function PermissionGate({ 
  permission, 
  children, 
  fallback = null,
  showLoading = false 
}: PermissionGateProps) {
  const { canAccess, loading } = useRoleGate({ redirectOnFail: false });

  if (loading) {
    if (showLoading) {
      return (
        <div className="animate-pulse text-sm text-muted-foreground">
          Checking permissions...
        </div>
      );
    }
    return null;
  }

  if (canAccess(permission)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}

/**
 * Hook version of PermissionGate for more complex logic.
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const canEditPricing = usePermission("editPricing");
 *   const canManageDiscounts = usePermission("manageDiscounts");
 *   
 *   return (
 *     <div>
 *       {canEditPricing && <EditButton />}
 *       {canManageDiscounts && <DiscountSection />}
 *     </div>
 *   );
 * }
 * ```
 */
export function usePermission(permission: PermissionKey): boolean {
  const { canAccess, loading } = useRoleGate({ redirectOnFail: false });
  
  if (loading) return false;
  return canAccess(permission);
}
