-- ============================================================
-- Migration: Dietitian SELECT policies for subscriptions + profiles_public
--
-- Background
-- ----------
-- Dietitians are not a core role -- they're users with the core "coach"
-- role plus an approved `dietitian` subrole, scoped to clients through
-- `care_team_assignments (specialty='dietitian', status='active')`.
--
-- Migration 20260207100009 added dietitian SELECT policies to every
-- `nutrition_*` table, but stopped there. As a result, a dietitian-only
-- viewer (no `subscriptions.coach_id = me` rows) sees ZERO subscriptions
-- and ZERO `profiles_public` rows for their assigned clients -- which
-- means there is no way to build a roster page for them.
--
-- Both tables' existing policies were grepped before this migration:
--   grep -rln "ON public.subscriptions"  + dietitian -> no matches
--   grep -rln "ON public.profiles_public" + dietitian -> no matches
-- Confirmed missing; safe to add.
--
-- Helper used: `public.is_dietitian_for_client(p_dietitian_uid, p_client_uid)`
-- from migration `20260207100001_dietitian_tables_functions.sql`. It is
-- SECURITY DEFINER and filters `care_team_assignments` on:
--   specialty = 'dietitian'::staff_specialty AND status = 'active'.
--
-- `care_team_assignments` has BOTH `status` (text, original) and
-- `lifecycle_status` (enum, added 20260126095746) columns; the helper
-- uses `status`, so this migration relies on `status='active'` being
-- the source of truth. Frontend code at
-- `src/hooks/useNutritionPermissions.ts:103` already filters on
-- `lifecycle_status='active'` -- the column discrepancy is pre-existing
-- and out of scope for this PR. Flagged for follow-up.
--
-- Read-only scope: dietitians only need to SELECT here to render their
-- roster. They never INSERT/UPDATE subscriptions or profiles. No write
-- policies are added.
-- ============================================================

-- ============================================================
-- subscriptions: dietitian SELECT
-- ============================================================
DROP POLICY IF EXISTS "subscriptions_dietitian_select" ON public.subscriptions;
CREATE POLICY "subscriptions_dietitian_select"
ON public.subscriptions
FOR SELECT
USING (
  public.is_dietitian_for_client(auth.uid(), user_id)
);

COMMENT ON POLICY "subscriptions_dietitian_select" ON public.subscriptions IS
  'Dietitians can read subscriptions for clients on whom they hold an active care_team_assignments row with specialty=dietitian.';

-- ============================================================
-- profiles_public: dietitian SELECT
-- ============================================================
DROP POLICY IF EXISTS "profiles_public_dietitian_select" ON public.profiles_public;
CREATE POLICY "profiles_public_dietitian_select"
ON public.profiles_public
FOR SELECT
USING (
  public.is_dietitian_for_client(auth.uid(), id)
);

COMMENT ON POLICY "profiles_public_dietitian_select" ON public.profiles_public IS
  'Dietitians can read the public profile of clients on whom they hold an active care_team_assignments row with specialty=dietitian.';
