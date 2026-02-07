-- ============================================================
-- Phase 26: Clean Up specialization_tags
-- Deactivate credential-like tags, add new marketing tags
-- ============================================================

-- Deactivate any credential-like tags that overlap with subroles
-- (These may not exist in current data, but guard against future re-inserts)
UPDATE public.specialization_tags
SET is_active = false
WHERE value IN ('physiotherapist', 'dietician', 'dietitian', 'sports_psychologist')
  AND is_active = true;

-- Add new marketing tags (ON CONFLICT to be idempotent)
INSERT INTO public.specialization_tags (value, label, sort_order, is_active) VALUES
  ('contest_prep', 'Contest Prep', 16, true),
  ('online_coaching', 'Online Coaching', 17, true)
ON CONFLICT (value) DO UPDATE
  SET is_active = true,
      sort_order = EXCLUDED.sort_order;
