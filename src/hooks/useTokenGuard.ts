
/**
 * Global 401 Interceptor & Token Refresh Guard
 *
 * Monitors Supabase API responses for 401 errors caused by expired JWTs.
 * When detected:
 * 1. Attempts to refresh the token via supabase.auth.refreshSession()
 * 2. If refresh succeeds, the next retry (by react-query or user) will work
 * 3. If refresh fails AND no refresh token exists → signs out
 *
 * IMPORTANT: Supabase's built-in autoRefreshToken handles most refresh cases.
 * This guard is a safety net, NOT the primary mechanism. We must not race
 * against Supabase and sign users out on transient failures (network hiccups,
 * race conditions). Only sign out when the session is genuinely unrecoverable
 * (no refresh token in storage).
 */

import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CACHE_KEYS } from '@/lib/constants';

/** How many seconds before expiry to proactively refresh */
const REFRESH_BUFFER_SECONDS = 300; // 5 minutes before expiry

/** Minimum time between refresh attempts to prevent loops */
const MIN_REFRESH_INTERVAL_MS = 10_000; // 10 seconds

/** How many consecutive refresh failures before signing out */
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Check if a refresh token exists in localStorage.
 * If there's no refresh token, the session is truly unrecoverable.
 */
function hasRefreshToken(): boolean {
  try {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    if (!key) return false;
    const stored = localStorage.getItem(key);
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    return !!parsed?.refresh_token;
  } catch {
    return false;
  }
}

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
 * Clear all auth state and redirect to sign-in.
 * Only called when the session is genuinely unrecoverable.
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
 * Handle a refresh failure: only sign out if the session is truly unrecoverable.
 * Returns true if the user was signed out.
 */
function handleRefreshFailure(consecutiveFailures: { current: number }): boolean {
  consecutiveFailures.current++;

  // If no refresh token exists at all, the session is gone — sign out immediately
  if (!hasRefreshToken()) {
    if (import.meta.env.DEV) console.warn('[TokenGuard] No refresh token in storage — session unrecoverable');
    forceSignOut();
    return true;
  }

  // If we've failed multiple consecutive times, sign out
  if (consecutiveFailures.current >= MAX_CONSECUTIVE_FAILURES) {
    if (import.meta.env.DEV) console.warn(`[TokenGuard] ${MAX_CONSECUTIVE_FAILURES} consecutive refresh failures — signing out`);
    forceSignOut();
    return true;
  }

  // Otherwise, let Supabase's built-in autoRefreshToken handle it
  if (import.meta.env.DEV) console.log(
    `[TokenGuard] Refresh failed (${consecutiveFailures.current}/${MAX_CONSECUTIVE_FAILURES}), ` +
    `deferring to Supabase auto-refresh`
  );
  return false;
}

/**
 * Hook: Install global 401 interceptor and proactive token refresh
 *
 * Place this once in your App component.
 */
export function useTokenGuard() {
  const lastRefreshAttempt = useRef(0);
  const refreshInProgress = useRef(false);
  const consecutiveFailures = useRef(0);

  useEffect(() => {
    // ============================================
    // 1. Proactive refresh on mount if token is expired or about to expire
    // ============================================
    const { expired, secondsRemaining } = getTokenExpiry();

    if (expired) {
      if (import.meta.env.DEV) console.log('[TokenGuard] Token already expired on mount, refreshing...');
      attemptTokenRefresh().then(success => {
        if (success) {
          consecutiveFailures.current = 0;
        } else {
          if (import.meta.env.DEV) console.warn('[TokenGuard] Could not refresh expired token on mount');
          handleRefreshFailure(consecutiveFailures);
        }
      });
    } else if (secondsRemaining < REFRESH_BUFFER_SECONDS && secondsRemaining > 0) {
      if (import.meta.env.DEV) console.log(`[TokenGuard] Token expiring in ${secondsRemaining}s, proactively refreshing...`);
      attemptTokenRefresh().then(success => {
        if (success) consecutiveFailures.current = 0;
      });
    }

    // ============================================
    // 2. Periodic check every 60 seconds
    // ============================================
    const intervalId = setInterval(() => {
      const { expired: isExpired, secondsRemaining: remaining } = getTokenExpiry();

      if (isExpired) {
        if (import.meta.env.DEV) console.log('[TokenGuard] Token expired during session, refreshing...');
        attemptTokenRefresh().then(success => {
          if (success) {
            consecutiveFailures.current = 0;
          } else {
            handleRefreshFailure(consecutiveFailures);
          }
        });
      } else if (remaining < REFRESH_BUFFER_SECONDS && remaining > 0) {
        if (import.meta.env.DEV) console.log(`[TokenGuard] Token expiring soon (${remaining}s), refreshing...`);
        attemptTokenRefresh().then(success => {
          if (success) consecutiveFailures.current = 0;
        });
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
            if (success) {
              consecutiveFailures.current = 0;
            } else {
              if (import.meta.env.DEV) console.error('[TokenGuard] Token refresh failed after 401');
              handleRefreshFailure(consecutiveFailures);
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
            if (success) {
              consecutiveFailures.current = 0;
            } else {
              handleRefreshFailure(consecutiveFailures);
            }
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ============================================
    // 5. Listen for Supabase auth state changes — reset failure counter on success
    // ============================================
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        consecutiveFailures.current = 0;
      }
    });

    return () => {
      clearInterval(intervalId);
      window.fetch = originalFetch;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      subscription.unsubscribe();
    };
  }, []);
}

export default useTokenGuard;
