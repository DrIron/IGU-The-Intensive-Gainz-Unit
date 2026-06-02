/**
 * Shared accessor for the Supabase access token persisted in localStorage.
 *
 * Extracted from RoleProtectedRoute.tsx (B3-N8) so both the route guard and
 * Auth.tsx's timeout-fallback can gate "trust the cached roles" on the presence
 * of a real session token -- defeating pure-localStorage role tampering.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PROJECT_REF = SUPABASE_URL?.match(/https:\/\/([^.]+)\./)?.[1] || 'ghotrbotrywonaejlppg';
const STORAGE_KEY = `sb-${PROJECT_REF}-auth-token`;

/**
 * Get the stored access token directly from localStorage. Returns null when
 * there is no persisted Supabase session (or the entry is malformed).
 */
export function getStoredToken(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored)?.access_token || null;
  } catch {
    return null;
  }
}
