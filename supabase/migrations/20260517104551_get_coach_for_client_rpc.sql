-- Bug: clients couldn't read their primary coach's row.
--
-- Before this migration, the `coaches` table had three RLS policies:
--   1. "Admins full access to coaches" (admin only, ALL)
--   2. "coaches_admin_only"            (admin only, ALL — duplicate of #1)
--   3. "coaches_read_own"              (SELECT where user_id = auth.uid())
--
-- None of those let a client read their assigned coach. The view
-- `coaches_client_safe` (SELECT … FROM coaches WHERE status='active') was
-- *named* as if clients can read it, but reads against the view fell through
-- RLS to zero rows for every non-admin, non-self caller.
--
-- Repro on 2026-05-17 prod smoke test: signed in as a client account
-- (ce14d4f5-…), navigated to /client/workout/session/<id>. Page title rendered
-- `Strength by Coach` instead of the real coach name. The component query
-- `from('coaches_client_safe').select('first_name').eq('user_id', X)` returned
-- `null` even though the row exists. Service-role SELECT confirmed the data
-- is present — RLS was denying the read.
--
-- Affected surfaces (every client-facing component that displays coach info
-- via `coaches_client_safe`):
--   - src/pages/client/WorkoutSessionV2.tsx        (verified live)
--   - src/hooks/useTeams.ts                        (coach name + avatar on team list)
--   - src/pages/onboarding/AwaitingApproval.tsx    (coach name during onboarding)
--
-- Why an RPC, not a table-level RLS policy:
-- A row-level policy on `coaches` would gate which rows the client sees but
-- NOT which columns. The `authenticated` role has SELECT GRANT on all 20+
-- columns of `coaches`, so a permissive row policy would let an assigned
-- client SELECT * and pull `last_assigned_at`, `max_*_clients`, `age`,
-- `gender`, plus every Phase-3-deprecated profile column — wider than the
-- 8-column view's intent. Tightening with column GRANTs would also affect
-- coach self-reads (the `coaches_read_own` policy uses the same authenticated
-- role) and is hard to scope without breaking coach surfaces.
--
-- This RPC mirrors the existing pattern used for cross-role demographic
-- access (get_client_age, get_client_gender, get_client_height_cm): a
-- SECURITY DEFINER function that returns exactly the safe column set, gated
-- on the same care-team helpers used elsewhere. The table's RLS posture is
-- unchanged, so coach self-reads + admin reads + anything else that depended
-- on the existing policies continues to work.
--
-- The `coaches_client_safe` view itself is left in place — Phase 3 of the
-- coach-tables refactor will rebuild it on `coaches_public`. Marking it as
-- deprecated here so the next reader knows to call the RPC instead.

CREATE OR REPLACE FUNCTION public.get_coach_for_client(p_coach_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',                   c.id,
    'user_id',              c.user_id,
    'first_name',           c.first_name,
    'last_name',            c.last_name,
    'profile_picture_url',  c.profile_picture_url,
    'short_bio',            c.short_bio,
    'specializations',      c.specializations,
    'status',               c.status
  )
  FROM public.coaches c
  WHERE c.user_id = p_coach_user_id
    AND c.status = 'active'
    AND (
      public.is_primary_coach_for_user(c.user_id, (SELECT auth.uid()))
      OR public.is_care_team_member_for_client(c.user_id, (SELECT auth.uid()))
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_coach_for_client(uuid) IS
  'Returns the client-safe column subset of a coach record. Callable by any '
  'authenticated user; returns NULL unless the caller is assigned to the '
  'coach (primary or care-team). Use this from client-facing surfaces '
  'instead of querying coaches_client_safe directly — the view is RLS-broken '
  'for clients (see migration 20260517104551).';

GRANT EXECUTE ON FUNCTION public.get_coach_for_client(uuid) TO authenticated;

COMMENT ON VIEW public.coaches_client_safe IS
  'DEPRECATED for client-side reads: underlying coaches table RLS denies '
  'client SELECT, so this view returns 0 rows to clients despite its name. '
  'Use the get_coach_for_client(p_coach_user_id) RPC instead. Phase 3 of '
  'the coach-tables refactor will rebuild this view on coaches_public.';
