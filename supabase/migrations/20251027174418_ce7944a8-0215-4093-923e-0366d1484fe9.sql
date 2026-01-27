-- Add new fields to nutrition_phases for improvements
ALTER TABLE nutrition_phases
ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS reverse_tdee_actual numeric,
ADD COLUMN IF NOT EXISTS reverse_tdee_deviation numeric,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS phase_summary jsonb;

-- Add new fields to nutrition_adjustments for delay feature
ALTER TABLE nutrition_adjustments
ADD COLUMN IF NOT EXISTS is_delayed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS delayed_reason text;

-- Add index for archived phases query performance
CREATE INDEX IF NOT EXISTS idx_nutrition_phases_archived ON nutrition_phases(user_id, is_archived, is_active);

-- Add index for phase completion queries
CREATE INDEX IF NOT EXISTS idx_nutrition_phases_completed ON nutrition_phases(completed_at) WHERE completed_at IS NOT NULL;