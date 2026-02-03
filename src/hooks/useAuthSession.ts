/**
 * useAuthSession - Session management hook with timeout protection
 *
 * Key behaviors:
 * 1. Cache-first: check localStorage token immediately, don't wait for getSession()
 * 2. Set up onAuthStateChange FIRST, then race getSession() against timeout
 * 3. If getSession times out but we have a stored token, add grace period then set isLoading=false
 *
 * IMPORTANT: Does NOT call setSession() - that causes infinite loops via onAuthStateChange
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, getStoredAccessToken } from '@/integrations/supabase/client';
import { TIMEOUTS } from '@/lib/constants';

interface UseAuthSessionReturn {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  /** Manually refresh the session */
  refreshSession: () => Promise<void>;
  /** Get access token (from session or localStorage fallback) */
  getAccessToken: () => string | null;
}

// Grace period after timeout if we have a stored token
const TOKEN_GRACE_PERIOD_MS = 500;

/**
 * Get session with timeout protection
 */
async function getSessionWithTimeout(timeoutMs: number): Promise<Session | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.warn(`[AuthSession] getSession timed out after ${timeoutMs}ms`);
      resolve(null);
    }, timeoutMs);

    supabase.auth.getSession()
      .then(({ data, error }) => {
        clearTimeout(timeoutId);

        if (error) {
          console.error('[AuthSession] getSession error:', error);
          resolve(null);
          return;
        }

        console.log('[AuthSession] getSession completed:', {
          hasSession: !!data.session,
          hasAccessToken: !!data.session?.access_token,
        });

        resolve(data.session);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        console.error('[AuthSession] getSession exception:', error);
        resolve(null);
      });
  });
}

export function useAuthSession(): UseAuthSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const initAttempted = useRef(false);
  const authStateReceived = useRef(false);

  /**
   * Get access token from current session or localStorage fallback
   */
  const getAccessToken = useCallback((): string | null => {
    return session?.access_token ?? getStoredAccessToken();
  }, [session]);

  /**
   * Refresh session manually
   */
  const refreshSession = useCallback(async () => {
    console.log('[AuthSession] Manual session refresh requested');
    initAttempted.current = false;
    authStateReceived.current = false;

    setIsLoading(true);
    setError(null);

    try {
      const currentSession = await getSessionWithTimeout(TIMEOUTS.GET_SESSION);
      if (currentSession) {
        setSession(currentSession);
        setUser(currentSession.user);
      } else {
        setSession(null);
        setUser(null);
      }
    } catch (err) {
      console.error('[AuthSession] Refresh error:', err);
      setError(err instanceof Error ? err : new Error('Session refresh failed'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Set up auth state change listener FIRST (before getSession)
  useEffect(() => {
    console.log('[AuthSession] Setting up onAuthStateChange listener');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log('[AuthSession] Auth state changed:', event, {
          hasSession: !!newSession,
          userId: newSession?.user?.id,
        });

        authStateReceived.current = true;

        switch (event) {
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
            setSession(prev => {
              if (prev?.user?.id === newSession?.user?.id) {
                console.log('[AuthSession] Session unchanged, skipping update');
                return prev;
              }
              return newSession;
            });
            setUser(newSession?.user ?? null);
            setIsLoading(false);
            break;

          case 'SIGNED_OUT':
            setSession(null);
            setUser(null);
            setIsLoading(false);
            break;

          case 'INITIAL_SESSION':
            // This fires on page load
            setSession(prev => {
              if (prev) {
                console.log('[AuthSession] Already have session, skipping INITIAL_SESSION');
                return prev;
              }
              if (newSession) {
                setUser(newSession.user);
                setIsLoading(false);
              }
              return newSession;
            });
            break;
        }
      }
    );

    return () => {
      console.log('[AuthSession] Cleaning up onAuthStateChange listener');
      subscription.unsubscribe();
    };
  }, []);

  // Initialize session after auth listener is set up
  useEffect(() => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    const initSession = async () => {
      console.log('[AuthSession] Initializing session...');

      // Cache-first: check if we have a stored token immediately
      const storedToken = getStoredAccessToken();
      const hasStoredToken = !!storedToken;

      if (hasStoredToken) {
        console.log('[AuthSession] Found stored token, proceeding with cache-first approach');
      }

      setError(null);

      try {
        // Race getSession against timeout
        const currentSession = await getSessionWithTimeout(TIMEOUTS.GET_SESSION);

        if (currentSession) {
          console.log('[AuthSession] Session initialized:', {
            userId: currentSession.user?.id,
            email: currentSession.user?.email,
          });
          setSession(currentSession);
          setUser(currentSession.user);
          setIsLoading(false);
        } else if (hasStoredToken) {
          // getSession timed out but we have a stored token
          // Add grace period to let onAuthStateChange potentially fire
          console.log('[AuthSession] getSession timed out but have stored token, waiting grace period...');

          await new Promise(resolve => setTimeout(resolve, TOKEN_GRACE_PERIOD_MS));

          // Check if auth state change already handled it
          if (!authStateReceived.current) {
            console.log('[AuthSession] Grace period ended, no auth state received - relying on cache-first approach');
          }
          setIsLoading(false);
        } else {
          console.log('[AuthSession] No session and no stored token');
          setSession(null);
          setUser(null);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[AuthSession] Initialization error:', err);
        setError(err instanceof Error ? err : new Error('Session initialization failed'));
        setSession(null);
        setUser(null);
        setIsLoading(false);
      }
    };

    initSession();
  }, []);

  return {
    session,
    user,
    isLoading,
    error,
    refreshSession,
    getAccessToken,
  };
}

export default useAuthSession;
