-- Hardening (consistency): the movement taxonomy is coach/authenticated-facing. It's already
-- functionally locked to authenticated readers (movement_pattern_groups is authenticated-only under
-- RLS; exercise_movement_map is security_invoker → anon resolves 0 rows), but Supabase auto-grants
-- SELECT to anon/PUBLIC on new public objects. Revoke those so the grant list matches the posture
-- and follows the same REVOKE-anon/PUBLIC convention as our RPCs. No behaviour change.
REVOKE SELECT ON public.exercise_movement_map FROM anon, PUBLIC;
REVOKE SELECT ON public.movement_groups FROM anon, PUBLIC;
REVOKE SELECT ON public.movement_pattern_groups FROM anon, PUBLIC;
