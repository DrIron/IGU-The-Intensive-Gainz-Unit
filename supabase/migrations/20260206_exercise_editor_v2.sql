-- Exercise Editor V2: Per-set row-based layout
-- Adds sets_json JSONB column to store per-set prescription data
-- When NULL, legacy scalar fields (set_count, rep_range_min, etc.) are used

ALTER TABLE public.exercise_prescriptions
ADD COLUMN IF NOT EXISTS sets_json JSONB DEFAULT NULL;

COMMENT ON COLUMN public.exercise_prescriptions.sets_json IS
  'Array of SetPrescription objects for per-set values. NULL means use legacy scalar fields.';
