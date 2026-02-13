-- Fix DB data issues discovered during pre-launch QA (Feb 13, 2026)
-- Bug #1: Missing indexes on RLS-critical columns causing module_exercises timeouts
-- Bug #4: CMS prices don't match updated service prices (50→40, 175→150)
-- Bug #13: Team Plan price is 0 KWD (ON CONFLICT DO NOTHING skipped the 12 KWD insert)
-- Bug #14: Bunz/Fe Squad services still active

-- ============================================================
-- Bug #1: Add missing indexes for RLS policy performance
-- ============================================================
-- These columns are used in nested EXISTS subqueries within RLS policies
-- on module_exercises, exercise_prescriptions, client_module_exercises.
-- Without indexes, PostgreSQL does sequential scans on every RLS check.

CREATE INDEX IF NOT EXISTS idx_program_templates_owner
  ON public.program_templates (owner_coach_id);

CREATE INDEX IF NOT EXISTS idx_program_templates_visibility
  ON public.program_templates (visibility)
  WHERE visibility = 'shared';

CREATE INDEX IF NOT EXISTS idx_program_template_days_template
  ON public.program_template_days (program_template_id);

CREATE INDEX IF NOT EXISTS idx_client_program_days_program
  ON public.client_program_days (client_program_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_coach_status
  ON public.subscriptions (coach_id, status);

CREATE INDEX IF NOT EXISTS idx_care_team_assignments_staff_client
  ON public.care_team_assignments (staff_user_id, client_id)
  WHERE lifecycle_status = 'active';

-- ============================================================
-- Bug #13: Fix Team Plan price (0 → 12 KWD)
-- ============================================================
UPDATE public.services
SET price_kwd = 12
WHERE slug = 'team_plan' AND (price_kwd IS NULL OR price_kwd = 0);

-- ============================================================
-- Bug #14: Deactivate old team services
-- ============================================================
UPDATE public.services
SET is_active = false
WHERE slug IN ('team_fe_squad', 'team_bunz') AND is_active = true;

-- ============================================================
-- Bug #4: Update CMS prices to match current service pricing
-- ============================================================
-- Online: 50 → 40 KWD (updated in migration 20260211073338)
UPDATE public.site_content
SET value = '40', updated_at = now()
WHERE page = 'homepage' AND section = 'programs' AND key = 'online_price' AND value = '50';

-- Hybrid: 175 → 150 KWD (updated in migration 20260211073338)
UPDATE public.site_content
SET value = '150', updated_at = now()
WHERE page = 'homepage' AND section = 'programs' AND key = 'hybrid_price' AND value = '175';
