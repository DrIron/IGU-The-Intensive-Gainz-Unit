/**
 * RoleProtectedRoute - Cache-First Auth Guard Component
 *
 * This component protects routes based on user roles with a cache-first approach
 * to solve the page refresh authentication issue.
 *
 * Strategy:
 * 1. Check localStorage cache immediately (instant)
 * 2. If cache hit -> render protected content immediately
 * 3. Verify with server in background (non-blocking)
 * 4. If verification fails -> redirect appropriately
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuthSession } from '@/hooks/useAuthSession';
import { useRoleCache } from '@/hooks/useRoleCache';
import { TIMEOUTS, AUTH_ROUTES } from '@/lib/constants';
import {
  isRouteBlockedForRole,
  getPrimaryDashboardForRole,
  AppRole,
} from '@/lib/routeConfig';

type Role = 'admin' | 'coach' | 'client';

interface RoleProtectedRouteProps {
  children: React.ReactNode;
  requiredRole: Role;
}

type AuthState = 'loading' | 'authorized' | 'unauthorized' | 'no-session';

/**
 * Query user roles from database with timeout
 * Uses RPC function (SECURITY DEFINER) for reliability, with direct query fallback
 */
async function fetchUserRoles(userId: string): Promise<string[]> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.warn(`[RoleProtectedRoute] Roles query timed out after ${TIMEOUTS.ROLES_QUERY}ms`);
      resolve([]);
    }, TIMEOUTS.ROLES_QUERY);

    // Use RPC function - bypasses RLS, more reliable
    supabase.rpc('get_my_roles')
      .then(({ data, error }) => {
        clearTimeout(timeoutId);

        if (error) {
          console.error('[RoleProtectedRoute] RPC get_my_roles error:', error);
          // Fallback to direct query
          return supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', userId)
            .then(({ data: fallbackData, error: fallbackError }) => {
              if (fallbackError) {
                console.error('[RoleProtectedRoute] Fallback query error:', fallbackError);
                resolve([]);
                return;
              }
              const roles = fallbackData?.map(r => r.role) || [];
              console.log('[RoleProtectedRoute] Roles from fallback:', roles);
              resolve(roles);
            });
        }

        // RPC returns text[] directly
        const roles = (data as string[]) || [];
        console.log('[RoleProtectedRoute] Roles from RPC:', roles);
        resolve(roles);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        console.error('[RoleProtectedRoute] Roles query exception:', error);
        resolve([]);
      });
  });
}

/**
 * Check if user has required role
 */
function hasRequiredRole(userRoles: string[], requiredRole: Role): boolean {
  const isAdmin = userRoles.includes('admin');
  const isCoach = userRoles.includes('coach');
  const isClient = !isAdmin && !isCoach;

  switch (requiredRole) {
    case 'admin':
      return isAdmin;
    case 'coach':
      return isCoach;
    case 'client':
      return isClient;
    default:
      return false;
  }
}

/**
 * Get the primary role from a list of roles
 */
function getPrimaryRole(userRoles: string[]): AppRole {
  if (userRoles.includes('admin')) return 'admin';
  if (userRoles.includes('coach')) return 'coach';
  return 'client';
}

/**
 * Get redirect destination for a role
 */
function getRedirectForRole(primaryRole: AppRole): string {
  switch (primaryRole) {
    case 'admin':
      return AUTH_ROUTES.ADMIN_DASHBOARD;
    case 'coach':
      return AUTH_ROUTES.COACH_DASHBOARD;
    default:
      return AUTH_ROUTES.CLIENT_DASHBOARD;
  }
}

/**
 * STRICT Role-based route protection - NO role overlap:
 * - /admin/* requires admin role ONLY - coaches are BLOCKED
 * - /coach/* requires coach role ONLY - admins must use separate coach account
 * - /client routes require client role (no admin/coach role)
 *
 * Uses cache-first approach to solve page refresh authentication issues.
 */
export function RoleProtectedRoute({ children, requiredRole }: RoleProtectedRouteProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, user, isLoading: sessionLoading } = useAuthSession();
  const { getCachedRoles, setCachedRoles, isCacheValid } = useRoleCache();

  const [authState, setAuthState] = useState<AuthState>('loading');
  const [currentRoles, setCurrentRoles] = useState<string[]>([]);
  const verificationAttempted = useRef(false);
  const lastUserId = useRef<string | null>(null);
  // Guard to prevent re-running authorization while already checking
  const isCheckingAuth = useRef(false);
  // CRITICAL: Use ref to track authorization - refs are synchronous and don't suffer from React's batched state updates
  const isAuthorizedRef = useRef(false);

  /**
   * Log access decisions for debugging
   */
  const logAccess = useCallback((
    decision: 'GRANTED' | 'BLOCKED' | 'PENDING',
    details: Record<string, unknown>
  ) => {
    console.log(`[RoleProtectedRoute][${decision}]`, {
      route: location.pathname,
      requiredRole,
      ...details,
    });
  }, [location.pathname, requiredRole]);

  /**
   * Handle authorization failure with appropriate redirect
   */
  const handleUnauthorized = useCallback((roles: string[], reason: string) => {
    const primaryRole = getPrimaryRole(roles);

    logAccess('BLOCKED', { roles, primaryRole, reason });

    // Show toast with appropriate message
    if (requiredRole === 'admin') {
      toast.error('Access Denied', {
        description: 'Admin access required for this page.'
      });
    } else if (requiredRole === 'coach') {
      toast.error('Access Denied', {
        description: 'Coach access required. Admins must use a separate coach account.'
      });
    } else {
      toast.error('Access Denied', {
        description: 'This page is for clients only.'
      });
    }

    // Navigate to appropriate dashboard
    navigate(getRedirectForRole(primaryRole), { replace: true });
    isAuthorizedRef.current = false;
    setAuthState('unauthorized');
  }, [logAccess, navigate, requiredRole]);

  /**
   * Verify roles with server (background operation)
   * CRITICAL: This must NEVER revoke access that was already granted via cache.
   * If the server fails or returns empty, we keep the cached authorization.
   */
  const verifyRolesWithServer = useCallback(async (userId: string) => {
    if (verificationAttempted.current && lastUserId.current === userId) {
      console.log('[RoleProtectedRoute] Skipping duplicate verification');
      return;
    }

    verificationAttempted.current = true;
    lastUserId.current = userId;

    console.log('[RoleProtectedRoute] Starting background verification for user:', userId);

    const serverRoles = await fetchUserRoles(userId);

    if (serverRoles.length > 0) {
      // Update cache with fresh server data
      setCachedRoles(serverRoles, userId);
      setCurrentRoles(serverRoles);

      // Re-check authorization with fresh data
      if (hasRequiredRole(serverRoles, requiredRole)) {
        // Check route blocking
        const primaryRole = getPrimaryRole(serverRoles);
        if (isRouteBlockedForRole(location.pathname, primaryRole)) {
          handleUnauthorized(serverRoles, 'route-blocked');
          return;
        }

        logAccess('GRANTED', { roles: serverRoles, source: 'server-verified' });
        isAuthorizedRef.current = true;
        setAuthState('authorized');
      } else {
        // Server says different role - only revoke if we're confident
        // (i.e., server actually returned roles, not just an empty/error response)
        handleUnauthorized(serverRoles, 'role-mismatch');
      }
    } else {
      // Server returned no roles - could be RLS issue, timeout, or auth token not attached
      console.warn('[RoleProtectedRoute] Server returned no roles - possible RLS issue');

      // NEVER revoke access based on empty server response
      // If we already granted access via cache, keep it
      if (isAuthorizedRef.current) {
        console.log('[RoleProtectedRoute] Keeping authorization - already granted via cache, server returned empty');
      } else {
        // Check localStorage directly (currentRoles state may be stale in closure)
        const cachedRoles = getCachedRoles(userId);
        if (cachedRoles && cachedRoles.length > 0) {
          console.log('[RoleProtectedRoute] Keeping cached roles due to server failure');
        } else {
          isAuthorizedRef.current = false;
          setAuthState('unauthorized');
        }
      }
    }
  }, [requiredRole, setCachedRoles, getCachedRoles, logAccess, handleUnauthorized, location.pathname]);

  /**
   * Main authorization logic
   */
  useEffect(() => {
    // GUARD AT USEEFFECT LEVEL - check ref BEFORE calling async function
    // Refs are synchronous and don't suffer from React's batched state updates
    // This prevents re-running authorization when user state temporarily becomes null
    if (isAuthorizedRef.current) {
      console.log('[RoleProtectedRoute] useEffect: Already authorized (ref check), skipping checkAuthorization');
      return;
    }

    const checkAuthorization = async () => {
      // Skip if we're already checking (prevents loops from onAuthStateChange)
      if (isCheckingAuth.current) {
        console.log('[RoleProtectedRoute] Already checking auth, skipping');
        return;
      }

      isCheckingAuth.current = true;

      console.log('[RoleProtectedRoute] Checking authorization...', {
        sessionLoading,
        hasUser: !!user,
        userId: user?.id,
      });

      try {
        // Still loading session
        if (sessionLoading) {
          setAuthState('loading');
          return;
        }

        // No session at all
        if (!user) {
          // Quick check: do we have valid cached roles?
          // This handles the race condition where session isn't ready yet
          const cachedRoles = getCachedRoles();

          if (cachedRoles && cachedRoles.length > 0) {
            // CACHE-FIRST: If we have cached roles with the required role, grant access IMMEDIATELY
            // Don't wait for session - trust the cache and verify in background
            if (hasRequiredRole(cachedRoles, requiredRole)) {
              const primaryRole = getPrimaryRole(cachedRoles);
              if (isRouteBlockedForRole(location.pathname, primaryRole)) {
                handleUnauthorized(cachedRoles, 'route-blocked-no-session');
                return;
              }

              console.log('[RoleProtectedRoute] No session but cached roles valid - granting access immediately');
              setCurrentRoles(cachedRoles);
              logAccess('GRANTED', { roles: cachedRoles, source: 'cache-no-session' });
              isAuthorizedRef.current = true;
              setAuthState('authorized');
              // Session will sync in background via onAuthStateChange
              return;
            } else {
              // Cached roles don't have required role - redirect
              handleUnauthorized(cachedRoles, 'role-mismatch-cached-no-session');
              return;
            }
          }

          logAccess('BLOCKED', { reason: 'no-session' });
          isAuthorizedRef.current = false;
          setAuthState('no-session');
          return;
        }

        const userId = user.id;
        lastUserId.current = userId;

      // ============================================
      // CACHE-FIRST APPROACH - This is the key fix
      // ============================================

      // Step 1: Check cache immediately
      const cachedRoles = getCachedRoles(userId);

      if (cachedRoles && cachedRoles.length > 0) {
        setCurrentRoles(cachedRoles);

        if (hasRequiredRole(cachedRoles, requiredRole)) {
          // Check route blocking
          const primaryRole = getPrimaryRole(cachedRoles);
          if (isRouteBlockedForRole(location.pathname, primaryRole)) {
            handleUnauthorized(cachedRoles, 'route-blocked');
            return;
          }

          logAccess('GRANTED', { roles: cachedRoles, source: 'cache' });
          isAuthorizedRef.current = true;
          setAuthState('authorized');

          // Step 2: Verify in background (non-blocking)
          if (!isCacheValid(userId)) {
            console.log('[RoleProtectedRoute] Cache stale - verifying in background');
            verifyRolesWithServer(userId);
          }
          return;
        } else {
          // User is authenticated but doesn't have required role
          handleUnauthorized(cachedRoles, 'role-mismatch-cached');
          return;
        }
      }

      // Step 3: No cache - must fetch from server (blocking)
      console.log('[RoleProtectedRoute] No cached roles - fetching from server');
      setAuthState('loading');

      const serverRoles = await fetchUserRoles(userId);

      if (serverRoles.length > 0) {
        setCachedRoles(serverRoles, userId);
        setCurrentRoles(serverRoles);

        if (hasRequiredRole(serverRoles, requiredRole)) {
          // Check route blocking
          const primaryRole = getPrimaryRole(serverRoles);
          if (isRouteBlockedForRole(location.pathname, primaryRole)) {
            handleUnauthorized(serverRoles, 'route-blocked');
            return;
          }

          logAccess('GRANTED', { roles: serverRoles, source: 'server' });
          isAuthorizedRef.current = true;
          setAuthState('authorized');
        } else {
          handleUnauthorized(serverRoles, 'role-mismatch-server');
        }
      } else {
        // No roles from server - this is the problematic case
        console.error('[RoleProtectedRoute] No roles from server - likely auth header issue');
        logAccess('BLOCKED', { reason: 'no-roles-from-server' });
        isAuthorizedRef.current = false;
        setAuthState('unauthorized');
      }
      } finally {
        isCheckingAuth.current = false;
      }
    };

    checkAuthorization();
  }, [
    sessionLoading,
    user,
    requiredRole,
    getCachedRoles,
    setCachedRoles,
    isCacheValid,
    verifyRolesWithServer,
    logAccess,
    handleUnauthorized,
    location.pathname,
    // Note: authState removed from deps - we use isAuthorizedRef (synchronous) for the guard instead
  ]);

  // Reset flags when user actually changes (different user signs in)
  useEffect(() => {
    if (user?.id !== lastUserId.current) {
      verificationAttempted.current = false;
      // Only reset authorization if user actually changed to a different user
      // Don't reset if user just temporarily became null (session hiccup)
      if (user?.id && lastUserId.current && user.id !== lastUserId.current) {
        console.log('[RoleProtectedRoute] User changed, resetting authorization');
        isAuthorizedRef.current = false;
      }
    }
  }, [user?.id]);

  // Render based on auth state
  switch (authState) {
    case 'loading':
      return (
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Verifying access...</p>
          </div>
        </div>
      );

    case 'no-session':
      return (
        <Navigate
          to={AUTH_ROUTES.SIGN_IN}
          state={{ from: location }}
          replace
        />
      );

    case 'unauthorized':
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
                {requiredRole === 'admin'
                  ? 'This area is restricted to administrators only. Your account does not have admin privileges.'
                  : requiredRole === 'coach'
                  ? 'This area is for coaches only. Admins must use a separate coach account.'
                  : 'You don\'t have permission to view this page.'
                }
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              If you believe this is an error, please contact support.
            </p>
          </div>
        </div>
      );

    case 'authorized':
      return <div className="animate-fade-in">{children}</div>;

    default:
      return null;
  }
}
