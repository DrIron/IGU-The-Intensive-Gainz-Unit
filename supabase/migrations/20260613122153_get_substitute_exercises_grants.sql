-- Phase 4 (cont.): scope get_substitute_exercises to authenticated callers only.
-- Mandatory REVOKE pattern (CLAUDE.md § SECURITY DEFINER RPCs): a bare GRANT does
-- NOT remove the default anon grant. Coaches AND clients call this from the frontend.

REVOKE ALL ON FUNCTION public.get_substitute_exercises(uuid, text[], int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_substitute_exercises(uuid, text[], int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_substitute_exercises(uuid, text[], int) TO authenticated;
