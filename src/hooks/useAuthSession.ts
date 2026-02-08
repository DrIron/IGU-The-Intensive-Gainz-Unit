/**
 * useAuthSession - Session management hook with timeout protection
 *
 * Key behaviors:
 * 1. Set up onAuthStateChange FIRST to catch INITIAL_SESSION
 * 2. Race getSession() against timeout as fallback
 * 3. Relies on Supabase's built-in auto-refresh (no monkey-patching)
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
  /** Get access token from current session */
  getAccessToken: () => string | null;
}

export function useAuthSession(): UseAuthSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const initDone = useRef(false);

  const getAccessToken = useCallback((): string | null => {
    return session?.access_token ?? null;
  }, [session]);

  const refreshSession = useCallback(async () => {
    console.log('[AuthSession] Manual session refresh requested');
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      setSession(data.session);
      setUser(data.session?.user ?? null);
    } catch (err) {
      console.error('[AuthSession] Refresh error:', err);
      setError(err instanceof Error ? err : new Error('Session refresh failed'));
      setSession(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;

    console.log('[AuthSession] Initializing...');

    // 1. Listen for auth state changes (fires INITIAL_SESSION on mount)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        console.log('[AuthSession] Auth event:', event, {
          hasSession: !!newSession,
          userId: newSession?.user?.id,
        });

        switch (event) {
          case 'INITIAL_SESSION':
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
            setSession(newSession);
            setUser(newSession?.user ?? null);
            setIsLoading(false);
            break;

          case 'SIGNED_OUT':
            setSession(null);
            setUser(null);
            setIsLoading(false);
            break;
        }
      }
    );

    // 2. Safety timeout - if INITIAL_SESSION never fires, stop loading
    const safetyTimer = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) {
          console.warn('[AuthSession] Safety timeout - no auth event received');
          return false;
        }
        return prev;
      });
    }, TIMEOUTS.GET_SESSION + 1000);

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
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
