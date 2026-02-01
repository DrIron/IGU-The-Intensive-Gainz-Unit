/**
 * useAuthSession - Session management hook with timeout protection
 *
 * Key behaviors:
 * 1. Timeout protection for getSession() - returns null if it hangs
 * 2. onAuthStateChange listener for reliable session updates
 * 3. If session unavailable, relies on cache-first approach in RoleProtectedRoute
 *
 * IMPORTANT: Does NOT call setSession() - that causes infinite loops via onAuthStateChange
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
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

  /**
   * Initialize session
   */
  const initSession = useCallback(async () => {
    if (initAttempted.current) return;
    initAttempted.current = true;

    console.log('[AuthSession] Initializing session...');
    setIsLoading(true);
    setError(null);

    try {
      // Try normal getSession with timeout
      // If it fails/times out, we return null and let the cache-first approach handle it
      // DO NOT call setSession() here - it causes infinite loops via onAuthStateChange
      const currentSession = await getSessionWithTimeout(TIMEOUTS.GET_SESSION);

      if (currentSession) {
        console.log('[AuthSession] Session initialized:', {
          userId: currentSession.user?.id,
          email: currentSession.user?.email,
        });
        setSession(currentSession);
        setUser(currentSession.user);
      } else {
        console.log('[AuthSession] No session from getSession - relying on cache-first approach');
        setSession(null);
        setUser(null);
      }
    } catch (err) {
      console.error('[AuthSession] Initialization error:', err);
      setError(err instanceof Error ? err : new Error('Session initialization failed'));
      setSession(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Refresh session manually
   */
  const refreshSession = useCallback(async () => {
    console.log('[AuthSession] Manual session refresh requested');
    initAttempted.current = false;
    await initSession();
  }, [initSession]);

  /**
   * Get access token from current session
   */
  const getAccessToken = useCallback((): string | null => {
    return session?.access_token ?? null;
  }, [session]);

  // Initialize on mount
  useEffect(() => {
    initSession();
  }, [initSession]);

  // Listen for auth state changes
  useEffect(() => {
    console.log('[AuthSession] Setting up onAuthStateChange listener');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log('[AuthSession] Auth state changed:', event, {
          hasSession: !!newSession,
          userId: newSession?.user?.id,
        });

        switch (event) {
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
            // Only update if session actually changed (prevent unnecessary re-renders)
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
            // This fires on page load - but might be unreliable
            // We handle this in initSession instead
            // Only set if we don't already have a session
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
  }, []); // Empty deps - only subscribe once

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
