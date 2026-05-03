-- Phase 1A migration 1/6 — Coach column-ownership refactor
-- Creates the audit table that captures drift between `coaches` and
-- `coaches_public` for any duplicate column where both sides are populated
-- and disagree. Admin reviews, picks a winner, runs the resolution
-- UPDATE, then continues to migration 2.
--
-- Idempotent: re-running this migration is a no-op (CREATE TABLE IF NOT
-- EXISTS, CREATE POLICY guarded by DROP POLICY IF EXISTS).
--
-- See docs/COACH_TABLES_REFACTOR_PLAN.md § 2 (Backfill strategy) and § 3
-- (Migration plan).

CREATE TABLE IF NOT EXISTS public.coach_refactor_conflicts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL,
  column_name             TEXT NOT NULL,
  coaches_value           TEXT,
  coaches_public_value    TEXT,
  resolved_value          TEXT,
  resolved_at             TIMESTAMPTZ,
  resolved_by             UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coach_refactor_conflicts_user_column_uniq UNIQUE (user_id, column_name)
);

CREATE INDEX IF NOT EXISTS idx_coach_refactor_conflicts_user_id
  ON public.coach_refactor_conflicts (user_id);

CREATE INDEX IF NOT EXISTS idx_coach_refactor_conflicts_unresolved
  ON public.coach_refactor_conflicts (created_at)
  WHERE resolved_at IS NULL;

ALTER TABLE public.coach_refactor_conflicts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_refactor_conflicts_admin_only
  ON public.coach_refactor_conflicts;

CREATE POLICY coach_refactor_conflicts_admin_only
  ON public.coach_refactor_conflicts
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

COMMENT ON TABLE public.coach_refactor_conflicts IS
  'Phase 1A audit table for the coach column-ownership refactor. Captures '
  'rows where coaches.X and coaches_public.X both have non-empty values '
  'that differ. Admin resolves manually before Phase 1A migration 3 '
  'auto-merges the empty side. See docs/COACH_TABLES_REFACTOR_PLAN.md.';
