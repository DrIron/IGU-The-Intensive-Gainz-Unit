/**
 * useAuthSession - Improved session management hook
 *
 * Addresses the core issue where getSession() hangs on page refresh.
 * Uses a multi-pronged approach:
 * 1. Timeout protection for getSession()
 * 2. onAuthStateChange listener for reliable session updates
 * 3. Manual token extraction from localStorage as fallback
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
 * Extract session tokens from localStorage
 * Fallback when Supabase client state is out of sync
 */
function getTokensFromStorage(): { accessToken: string | null; refreshToken: string | null } {
  try {
    // Supabase stores session in localStorage with key pattern: sb-{project-ref}-auth-token
    const keys = Object.keys(localStorage);
    const authKey = keys.find(key => key.includes('-auth-token'));

    if (!authKey) {
      console.log('[AuthSession] No auth token key found in localStorage');
      return { accessToken: null, refreshToken: null };
    }

    const stored = localStorage.getItem(authKey);
    if (!stored) {
      return { accessToken: null, refreshToken: null };
    }

    const parsed = JSON.parse(stored);
    const accessToken = parsed?.access_token || null;
    const refreshToken = parsed?.refresh_token || null;

    console.log('[AuthSession] Extracted tokens from storage:', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
    });

    return { accessToken, refreshToken };
  } catch (error) {
    console.error('[AuthSession] Error extracting tokens from storage:', error);
    return { accessToken: null, refreshToken: null };
  }
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

/**
 * Try to restore session using tokens from localStorage
 */
async function tryRestoreSession(): Promise<Session | null> {
  const { accessToken, refreshToken } = getTokensFromStorage();

  if (!accessToken || !refreshToken) {
    console.log('[AuthSession] Cannot restore session - missing tokens');
    return null;
  }

  try {
    console.log('[AuthSession] Attempting to restore session with setSession...');

    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.error('[AuthSession] setSession failed:', error);
      return null;
    }

    console.log('[AuthSession] Session restored successfully:', {
      hasSession: !!data.session,
      userId: data.session?.user?.id,
    });

    return data.session;
  } catch (error) {
    console.error('[AuthSession] Error restoring session:', error);
    return null;
  }
}

export function useAuthSession(): UseAuthSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const initAttempted = useRef(false);
  // Flag to track if we're in the middle of restoring a session
  // This prevents onAuthStateChange from causing loops
  const isRestoring = useRef(false);

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
      // Step 1: Try normal getSession with timeout
      let currentSession = await getSessionWithTimeout(TIMEOUTS.GET_SESSION);

      // Step 2: If getSession failed/timed out, try manual restoration
      // NOTE: setSession() triggers onAuthStateChange which will update our state
      // We use isRestoring flag to prevent the handler from causing issues
      if (!currentSession) {
        console.log('[AuthSession] getSession failed, trying manual restoration...');
        isRestoring.current = true;
        currentSession = await tryRestoreSession();
        isRestoring.current = false;
      }

      // Step 3: Update state (only if not already set by onAuthStateChange)
      if (currentSession) {
        console.log('[AuthSession] Session initialized:', {
          userId: currentSession.user?.id,
          email: currentSession.user?.email,
        });
        setSession(currentSession);
        setUser(currentSession.user);
      } else {
        console.log('[AuthSession] No session available');
        setSession(null);
        setUser(null);
      }
    } catch (err) {
      console.error('[AuthSession] Initialization error:', err);
      setError(err instanceof Error ? err : new Error('Session initialization failed'));
      setSession(null);
      setUser(null);
      isRestoring.current = false;
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
   * Get access token (with localStorage fallback)
   */
  const getAccessToken = useCallback((): string | null => {
    if (session?.access_token) {
      return session.access_token;
    }

    const { accessToken } = getTokensFromStorage();
    return accessToken;
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
        // Skip if we're in the middle of restoring - we'll handle it in initSession
        if (isRestoring.current) {
          console.log('[AuthSession] Skipping onAuthStateChange - restoration in progress');
          return;
        }

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
  }, []); // Remove session from dependencies to prevent re-subscribing

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
