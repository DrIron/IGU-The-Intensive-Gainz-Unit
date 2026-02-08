/**
 * Auth & Session Constants
 *
 * Centralized configuration for authentication timeouts and cache keys.
 */

// Cache Keys - used for localStorage
export const CACHE_KEYS = {
  USER_ROLES: 'igu_user_roles',           // JSON array of role strings
  ROLE_CACHE_TIMESTAMP: 'igu_role_cache_timestamp',  // Unix timestamp
  USER_ID: 'igu_cached_user_id',          // User ID roles belong to
} as const;

// Timeouts (in milliseconds)
export const TIMEOUTS = {
  GET_SESSION: 5000,         // Max wait for getSession() call
  ROLES_QUERY: 10000,        // Max wait for user_roles query (includes getSession time)
  CACHE_TTL: 1000 * 60 * 60 * 24, // 24 hours - roles rarely change, verify in background
  AUTH_REDIRECT_DELAY: 500, // Delay before auth-related redirects
} as const;

// Routes - centralized route definitions for auth flows
export const AUTH_ROUTES = {
  ADMIN_DASHBOARD: '/admin/dashboard',
  COACH_DASHBOARD: '/coach/dashboard',
  CLIENT_DASHBOARD: '/dashboard',
  SIGN_IN: '/auth',
  NO_ACCESS: '/unauthorized',
} as const;

// Role definitions
export const ROLES = {
  ADMIN: 'admin',
  COACH: 'coach',
  CLIENT: 'client',
} as const;
