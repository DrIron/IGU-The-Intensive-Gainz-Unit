/**
 * useAuthSession - Session management hook
 *
 * Uses Supabase's native onAuthStateChange which fires INITIAL_SESSION
 * on mount. No custom session initialization needed.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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
      if (import.meta.env.DEV) console.error('[AuthSession] Refresh error:', err);
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

    // onAuthStateChange fires INITIAL_SESSION immediately on subscribe
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (import.meta.env.DEV) console.log('[AuthSession] Auth event:', event, {
          hasSession: !!newSession,
          userId: newSession?.user?.id,
        });

        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setIsLoading(false);
        } else if (newSession) {
          setSession(newSession);
          setUser(newSession.user);
          setIsLoading(false);
        } else if (event === 'INITIAL_SESSION') {
          // No session on initial load
          setIsLoading(false);
        }
      }
    );

    // Safety timeout — if no auth event fires within 5s, stop loading
    const safetyTimer = setTimeout(() => {
      setIsLoading(prev => {
        if (prev) {
          if (import.meta.env.DEV) console.warn('[AuthSession] Safety timeout - no auth event received');
          return false;
        }
        return prev;
      });
    }, 5000);

    return () => {
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  return { session, user, isLoading, error, refreshSession, getAccessToken };
}

export default useAuthSession;
