-- Fix: existing exercises have NULL arrays for resistance_profiles, secondary_muscles, tags
-- The DEFAULT '{}' on ALTER TABLE only applies to new rows, not existing ones
UPDATE exercise_library SET resistance_profiles = '{}' WHERE resistance_profiles IS NULL;
UPDATE exercise_library SET secondary_muscles = '{}' WHERE secondary_muscles IS NULL;
UPDATE exercise_library SET tags = '{}' WHERE tags IS NULL;
