-- Migration: Add value/label columns to specialization_tags for proper key-value pairs
-- This aligns coach specializations with client focus_areas for matching

-- Add value column (the snake_case key used for matching)
ALTER TABLE public.specialization_tags
ADD COLUMN IF NOT EXISTS value TEXT;

-- Rename name to label for clarity
ALTER TABLE public.specialization_tags
RENAME COLUMN name TO label;

-- Add updated_at column
ALTER TABLE public.specialization_tags
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Rename display_order to sort_order for consistency
ALTER TABLE public.specialization_tags
RENAME COLUMN display_order TO sort_order;

-- Create trigger to update updated_at on row changes
CREATE OR REPLACE FUNCTION update_specialization_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS specialization_tags_updated_at ON public.specialization_tags;
CREATE TRIGGER specialization_tags_updated_at
  BEFORE UPDATE ON public.specialization_tags
  FOR EACH ROW
  EXECUTE FUNCTION update_specialization_tags_updated_at();

-- Clear existing data and insert fresh aligned tags
TRUNCATE TABLE public.specialization_tags;

INSERT INTO public.specialization_tags (value, label, sort_order, is_active) VALUES
  ('general_fitness', 'General Fitness', 1, true),
  ('strength_training', 'Strength Training', 2, true),
  ('bodybuilding', 'Bodybuilding', 3, true),
  ('powerlifting', 'Powerlifting', 4, true),
  ('body_recomposition', 'Body Recomposition', 5, true),
  ('weight_loss', 'Weight Loss', 6, true),
  ('nutrition_coaching', 'Nutrition Coaching', 7, true),
  ('athletic_performance', 'Athletic Performance', 8, true),
  ('mobility_flexibility', 'Mobility & Flexibility', 9, true),
  ('running_endurance', 'Running & Endurance', 10, true),
  ('rehab_injury_prevention', 'Rehab & Injury Prevention', 11, true),
  ('contest_prep', 'Contest Prep', 12, true),
  ('womens_training', 'Women''s Training', 13, true),
  ('senior_fitness', 'Senior Fitness', 14, true),
  ('youth_training', 'Youth Training', 15, true);

-- Add unique constraint on value
ALTER TABLE public.specialization_tags
ADD CONSTRAINT specialization_tags_value_key UNIQUE (value);

-- Drop old name unique constraint if exists
ALTER TABLE public.specialization_tags
DROP CONSTRAINT IF EXISTS specialization_tags_name_key;

-- Drop old index and create new one
DROP INDEX IF EXISTS idx_specialization_tags_active_order;
CREATE INDEX idx_specialization_tags_active_sort
  ON public.specialization_tags (is_active, sort_order)
  WHERE is_active = true;

-- Update RLS policies to allow anon read (for unauthenticated coach application form)
DROP POLICY IF EXISTS "Anyone can read active specialization tags" ON public.specialization_tags;

-- Allow both anon and authenticated to read active tags
CREATE POLICY "Public read for active specialization tags"
  ON public.specialization_tags FOR SELECT
  USING (is_active = true);

-- Note: Insert/Update/Delete policies already exist for admin only
