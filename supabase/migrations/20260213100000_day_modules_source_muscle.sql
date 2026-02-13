-- Add source_muscle_id to day_modules for Planning Board → Program conversion tracking
-- Stores the muscle group ID (e.g. 'pecs', 'quads') so the exercise picker can auto-filter.
-- NULL for normal (non-muscle-converted) modules.

ALTER TABLE day_modules ADD COLUMN source_muscle_id text;
