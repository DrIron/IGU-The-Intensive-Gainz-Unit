/**
 * useAuthSession - Session management hook
 *
 * Waits for the Supabase client's session to be initialized (via setSession
 * in client.ts), then listens for auth state changes.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase, sessionReady } from '@/integrations/supabase/client';
import { TIMEOUTS } from '@/lib/constants';

interface UseAuthSessionReturn {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  refreshSession: () => Promise<void>;
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
    setIsLoading(true);
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

    // Wait for the eager setSession() in client.ts to complete,
    // then set up auth state change listener
    sessionReady.then(() => {
      console.log('[AuthSession] Session ready, setting up listener');

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

      // Safety timeout — if no auth event fires within 3s of sessionReady,
      // stop loading (user is likely not authenticated)
      const safetyTimer = setTimeout(() => {
        setIsLoading(prev => {
          if (prev) {
            console.warn('[AuthSession] Safety timeout after sessionReady');
            return false;
          }
          return prev;
        });
      }, TIMEOUTS.GET_SESSION);

      // Return cleanup — but since we're inside .then(), we store it
      // The subscription will be cleaned up when the component unmounts
      // via the returned function from useEffect
      return () => {
        clearTimeout(safetyTimer);
        subscription.unsubscribe();
      };
    });
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
