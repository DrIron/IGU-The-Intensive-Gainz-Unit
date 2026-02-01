/**
 * useAuthCleanup - Hook to handle authentication cleanup
 *
 * Ensures role cache is cleared when user signs out,
 * preventing stale cached roles from persisting.
 */

import { useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRoleCache } from './useRoleCache';

interface UseAuthCleanupReturn {
  /** Sign out and clear all cached data */
  signOutWithCleanup: () => Promise<void>;
  /** Clear all auth-related caches */
  clearAllCaches: () => void;
}

export function useAuthCleanup(): UseAuthCleanupReturn {
  const { clearCache } = useRoleCache();

  /**
   * Clear all auth-related caches
   */
  const clearAllCaches = useCallback(() => {
    console.log('[AuthCleanup] Clearing all auth caches');

    // Clear role cache
    clearCache();

    // Clear any other app-specific caches here as needed
  }, [clearCache]);

  /**
   * Sign out with full cleanup
   */
  const signOutWithCleanup = useCallback(async () => {
    console.log('[AuthCleanup] Starting sign out with cleanup...');

    try {
      // Clear caches first (before sign out)
      clearAllCaches();

      // Then sign out from Supabase
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('[AuthCleanup] Sign out error:', error);
        // Even if sign out fails, caches are already cleared
        // User will need to re-authenticate anyway
      }

      console.log('[AuthCleanup] Sign out complete');
    } catch (error) {
      console.error('[AuthCleanup] Sign out exception:', error);
      // Rethrow so caller can handle
      throw error;
    }
  }, [clearAllCaches]);

  // Listen for sign-out events to ensure cleanup (defensive)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_OUT') {
          console.log('[AuthCleanup] Detected SIGNED_OUT event - clearing caches');
          clearAllCaches();
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [clearAllCaches]);

  return {
    signOutWithCleanup,
    clearAllCaches,
  };
}

export default useAuthCleanup;
