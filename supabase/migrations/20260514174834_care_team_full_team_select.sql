-- ============================================================
-- Migration: Care team members can view the FULL team
--
-- Background
-- ----------
-- Migration 20260117073726 set up four RLS policies on
-- `care_team_assignments`:
--   1. admin            -> FOR ALL
--   2. primary coach    -> FOR ALL
--   3. care team member -> FOR SELECT, but ONLY their own row
--                          (`staff_user_id = auth.uid()`)
--   4. client           -> FOR SELECT, their own team (`client_id = auth.uid()`)
--
-- Policy #3 left assigned specialists -- dietitians especially -- half
-- blind: a dietitian who is authorised to inhabit a client's Care Team
-- surface (per the can_edit_nutrition hierarchy and the Care Team tab UX)
-- could only ever see the single row describing *themselves*, never the
-- primary coach or the other specialists they collaborate with.
--
-- This migration restores symmetry: an ACTIVE care team member can read
-- the whole team for a client they serve -- the same roster the client,
-- primary coach, and admin already see. It does NOT expand write access:
-- INSERT / UPDATE / DELETE remain locked to the admin and primary-coach
-- FOR ALL policies.
--
-- Mechanism
-- ---------
-- PostgreSQL OR-unions the USING clauses of every permissive policy for a
-- given command, so adding one more SELECT policy is purely additive --
-- the existing four policies are left untouched.
--
-- `public.is_care_team_member_for_client(staff_uid, client_uid)` (added in
-- 20260207100001) is SECURITY DEFINER and checks admin OR primary coach OR
-- an active `care_team_assignments` row. Because it is SECURITY DEFINER it
-- does not re-enter `care_team_assignments` RLS, so there is no recursion.
-- ============================================================

DROP POLICY IF EXISTS "care_team_members_view_full_team" ON public.care_team_assignments;
CREATE POLICY "care_team_members_view_full_team"
  ON public.care_team_assignments
  FOR SELECT
  USING (public.is_care_team_member_for_client(auth.uid(), client_id));

COMMENT ON POLICY "care_team_members_view_full_team" ON public.care_team_assignments IS
  'Active care team members can view the full team for clients they serve. Helper is SECURITY DEFINER so no RLS recursion. Does NOT expand write access -- primary coach + admin retain ALL.';
