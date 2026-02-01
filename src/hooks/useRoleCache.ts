/**
 * useRoleCache - Hook for managing cached user roles in localStorage
 *
 * This is the core of the auth session persistence fix. It provides:
 * 1. Immediate role access from cache (no network required)
 * 2. Cache invalidation based on user ID changes
 * 3. TTL-based cache expiration
 * 4. Type-safe role management
 */

import { useState, useCallback } from 'react';
import { CACHE_KEYS, TIMEOUTS } from '@/lib/constants';

interface CachedRoles {
  roles: string[];
  userId: string;
  timestamp: number;
}

interface UseRoleCacheReturn {
  /** Get cached roles if valid, returns null if cache miss or expired */
  getCachedRoles: (currentUserId?: string) => string[] | null;
  /** Save roles to cache */
  setCachedRoles: (roles: string[], userId: string) => void;
  /** Clear the role cache */
  clearCache: () => void;
  /** Check if cache is valid for given user */
  isCacheValid: (userId?: string) => boolean;
  /** Current cached roles (reactive) */
  cachedRoles: string[] | null;
  /** Cached user ID (for when session is unavailable) */
  cachedUserId: string | null;
}

/**
 * Parse cached roles from localStorage
 */
function parseCachedRoles(): CachedRoles | null {
  try {
    const rolesJson = localStorage.getItem(CACHE_KEYS.USER_ROLES);
    const timestamp = localStorage.getItem(CACHE_KEYS.ROLE_CACHE_TIMESTAMP);
    const userId = localStorage.getItem(CACHE_KEYS.USER_ID);

    if (!rolesJson || !timestamp || !userId) {
      return null;
    }

    const roles = JSON.parse(rolesJson);

    if (!Array.isArray(roles)) {
      console.warn('[RoleCache] Invalid roles format in cache');
      return null;
    }

    return {
      roles,
      userId,
      timestamp: parseInt(timestamp, 10),
    };
  } catch (error) {
    console.error('[RoleCache] Error parsing cached roles:', error);
    return null;
  }
}

/**
 * Check if cached roles are expired
 */
function isCacheExpired(timestamp: number): boolean {
  const now = Date.now();
  const age = now - timestamp;
  const expired = age > TIMEOUTS.CACHE_TTL;

  if (expired) {
    console.log(`[RoleCache] Cache expired (age: ${Math.round(age / 1000)}s, TTL: ${TIMEOUTS.CACHE_TTL / 1000}s)`);
  }

  return expired;
}

/**
 * Check if cached roles belong to current user
 */
function isUserMatch(cachedUserId: string, currentUserId?: string): boolean {
  if (!currentUserId) {
    // No current user ID provided - trust cache
    return true;
  }

  const matches = cachedUserId === currentUserId;

  if (!matches) {
    console.log(`[RoleCache] User mismatch: cached=${cachedUserId}, current=${currentUserId}`);
  }

  return matches;
}

/**
 * Internal clear function (doesn't update state)
 */
function clearCacheInternal(): void {
  localStorage.removeItem(CACHE_KEYS.USER_ROLES);
  localStorage.removeItem(CACHE_KEYS.ROLE_CACHE_TIMESTAMP);
  localStorage.removeItem(CACHE_KEYS.USER_ID);
}

export function useRoleCache(): UseRoleCacheReturn {
  const [cachedRoles, setCachedRolesState] = useState<string[] | null>(() => {
    const cached = parseCachedRoles();
    if (cached && !isCacheExpired(cached.timestamp)) {
      return cached.roles;
    }
    return null;
  });

  const [cachedUserId, setCachedUserIdState] = useState<string | null>(() => {
    const cached = parseCachedRoles();
    if (cached && !isCacheExpired(cached.timestamp)) {
      return cached.userId;
    }
    return null;
  });

  /**
   * Get cached roles if valid
   */
  const getCachedRoles = useCallback((currentUserId?: string): string[] | null => {
    const cached = parseCachedRoles();

    if (!cached) {
      console.log('[RoleCache] No cached roles found');
      return null;
    }

    // Check user match
    if (!isUserMatch(cached.userId, currentUserId)) {
      console.log('[RoleCache] Clearing cache due to user mismatch');
      clearCacheInternal();
      return null;
    }

    // Check expiration
    if (isCacheExpired(cached.timestamp)) {
      console.log('[RoleCache] Cache expired, but returning stale data for immediate use');
      // Return stale data - caller should verify in background
      return cached.roles;
    }

    console.log('[RoleCache] Returning valid cached roles:', cached.roles);
    return cached.roles;
  }, []);

  /**
   * Save roles to cache
   */
  const setCachedRoles = useCallback((roles: string[], userId: string): void => {
    try {
      console.log('[RoleCache] Caching roles:', roles, 'for user:', userId);

      localStorage.setItem(CACHE_KEYS.USER_ROLES, JSON.stringify(roles));
      localStorage.setItem(CACHE_KEYS.ROLE_CACHE_TIMESTAMP, Date.now().toString());
      localStorage.setItem(CACHE_KEYS.USER_ID, userId);

      setCachedRolesState(roles);
      setCachedUserIdState(userId);
    } catch (error) {
      console.error('[RoleCache] Error saving roles to cache:', error);
    }
  }, []);

  /**
   * Clear the role cache
   */
  const clearCache = useCallback((): void => {
    console.log('[RoleCache] Clearing role cache');
    clearCacheInternal();
    setCachedRolesState(null);
    setCachedUserIdState(null);
  }, []);

  /**
   * Check if cache is valid
   */
  const isCacheValid = useCallback((userId?: string): boolean => {
    const cached = parseCachedRoles();

    if (!cached) return false;
    if (!isUserMatch(cached.userId, userId)) return false;
    if (isCacheExpired(cached.timestamp)) return false;

    return true;
  }, []);

  return {
    getCachedRoles,
    setCachedRoles,
    clearCache,
    isCacheValid,
    cachedRoles,
    cachedUserId,
  };
}

export default useRoleCache;
