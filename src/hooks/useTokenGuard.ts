
/**
 * Global 401 Interceptor & Token Refresh Guard
 * 
 * Monitors Supabase API responses for 401 errors caused by expired JWTs.
 * When detected:
 * 1. Attempts to refresh the token via supabase.auth.refreshSession()
 * 2. If refresh succeeds, the next retry (by react-query or user) will work
 * 3. If refresh fails, clears the session and redirects to /auth
 * 
 * Also proactively checks token expiry on mount and refreshes if needed.
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CACHE_KEYS } from '@/lib/constants';

/** How many seconds before expiry to proactively refresh */
const REFRESH_BUFFER_SECONDS = 300; // 5 minutes before expiry

/** Minimum time between refresh attempts to prevent loops */
const MIN_REFRESH_INTERVAL_MS = 10_000; // 10 seconds

/**
 * Check if stored JWT is expired or about to expire
 */
function getTokenExpiry(): { expired: boolean; expiresAt: number | null; secondsRemaining: number } {
  try {
    const stored = localStorage.getItem(
      Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')) || ''
    );
    if (!stored) return { expired: false, expiresAt: null, secondsRemaining: Infinity };

    const parsed = JSON.parse(stored);
    const expiresAt = parsed?.expires_at;
    if (!expiresAt) return { expired: false, expiresAt: null, secondsRemaining: Infinity };

    const now = Math.floor(Date.now() / 1000);
    const secondsRemaining = expiresAt - now;

    return {
      expired: secondsRemaining <= 0,
      expiresAt,
      secondsRemaining,
    };
  } catch {
    return { expired: false, expiresAt: null, secondsRemaining: Infinity };
  }
}

/**
 * Attempt to refresh the session
 * Returns true if refresh succeeded
 */
async function attemptTokenRefresh(): Promise<boolean> {
  try {
    if (import.meta.env.DEV) console.log('[TokenGuard] Attempting token refresh...');
    const { data, error } = await supabase.auth.refreshSession();

    if (error) {
      if (import.meta.env.DEV) console.error('[TokenGuard] Token refresh failed:', error.message);
      return false;
    }

    if (data.session) {
      if (import.meta.env.DEV) console.log('[TokenGuard] Token refreshed successfully, new expiry:',
        new Date((data.session.expires_at || 0) * 1000).toISOString()
      );
      return true;
    }

    return false;
  } catch (err) {
    if (import.meta.env.DEV) console.error('[TokenGuard] Token refresh exception:', err);
    return false;
  }
}

/**
 * Clear all auth state and redirect to sign-in
 */
function forceSignOut() {
  if (import.meta.env.DEV) console.log('[TokenGuard] Forcing sign-out due to unrecoverable auth state');

  // Clear role cache
  localStorage.removeItem(CACHE_KEYS.USER_ROLES);
  localStorage.removeItem(CACHE_KEYS.ROLE_CACHE_TIMESTAMP);
  localStorage.removeItem(CACHE_KEYS.USER_ID);

  // Sign out via Supabase (clears session storage)
  supabase.auth.signOut().catch(() => {});

  // Redirect to auth page
  if (!window.location.pathname.startsWith('/auth')) {
    window.location.href = '/auth';
  }
}

/**
 * Hook: Install global 401 interceptor and proactive token refresh
 * 
 * Place this once in your App component.
 */
export function useTokenGuard() {
  const lastRefreshAttempt = useRef(0);
  const refreshInProgress = useRef(false);

  useEffect(() => {
    // ============================================
    // 1. Proactive refresh on mount if token is expired or about to expire
    // ============================================
    const { expired, secondsRemaining } = getTokenExpiry();

    if (expired) {
      if (import.meta.env.DEV) console.log('[TokenGuard] Token already expired on mount, refreshing...');
      attemptTokenRefresh().then(success => {
        if (!success) {
          if (import.meta.env.DEV) console.warn('[TokenGuard] Could not refresh expired token on mount');
          forceSignOut();
        }
      });
    } else if (secondsRemaining < REFRESH_BUFFER_SECONDS && secondsRemaining > 0) {
      if (import.meta.env.DEV) console.log(`[TokenGuard] Token expiring in ${secondsRemaining}s, proactively refreshing...`);
      attemptTokenRefresh();
    }

    // ============================================
    // 2. Periodic check every 60 seconds
    // ============================================
    const intervalId = setInterval(() => {
      const { expired: isExpired, secondsRemaining: remaining } = getTokenExpiry();

      if (isExpired) {
        if (import.meta.env.DEV) console.log('[TokenGuard] Token expired during session, refreshing...');
        attemptTokenRefresh().then(success => {
          if (!success) forceSignOut();
        });
      } else if (remaining < REFRESH_BUFFER_SECONDS && remaining > 0) {
        if (import.meta.env.DEV) console.log(`[TokenGuard] Token expiring soon (${remaining}s), refreshing...`);
        attemptTokenRefresh();
      }
    }, 60_000);

    // ============================================
    // 3. Intercept fetch for 401 responses from Supabase
    // ============================================
    const originalFetch = window.fetch;

    window.fetch = async function patchedFetch(input, init) {
      const response = await originalFetch.call(this, input, init);

      // Only intercept Supabase API calls
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
      const isSupabaseCall = url.includes('supabase.co/rest/') || url.includes('supabase.co/auth/');

      if (response.status === 401 && isSupabaseCall && !url.includes('/auth/v1/token')) {
        const now = Date.now();
        const timeSinceLastRefresh = now - lastRefreshAttempt.current;

        // Avoid refresh loops
        if (timeSinceLastRefresh > MIN_REFRESH_INTERVAL_MS && !refreshInProgress.current) {
          lastRefreshAttempt.current = now;
          refreshInProgress.current = true;

          if (import.meta.env.DEV) console.warn('[TokenGuard] 401 detected on Supabase API call, attempting token refresh');

          try {
            const success = await attemptTokenRefresh();
            if (!success) {
              if (import.meta.env.DEV) console.error('[TokenGuard] Token refresh failed after 401 - session is invalid');
              forceSignOut();
            }
          } finally {
            refreshInProgress.current = false;
          }
        }
      }

      return response;
    };

    // ============================================
    // 4. Listen for visibility change (tab becomes active again)
    // ============================================
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const { expired: isExpired } = getTokenExpiry();
        if (isExpired) {
          if (import.meta.env.DEV) console.log('[TokenGuard] Tab became visible with expired token, refreshing...');
          attemptTokenRefresh().then(success => {
            if (!success) forceSignOut();
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(intervalId);
      window.fetch = originalFetch;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}

export default useTokenGuard;
