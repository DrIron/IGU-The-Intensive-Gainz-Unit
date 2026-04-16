-- Merge mid_back + upper_back into upper_mid_back in saved Planning Board data
-- Update slot_config JSONB in muscle_program_templates

UPDATE muscle_program_templates
SET slot_config = REPLACE(REPLACE(
  slot_config::text,
  '"mid_back"', '"upper_mid_back"'),
  '"upper_back"', '"upper_mid_back"'
)::jsonb
WHERE slot_config::text LIKE '%mid_back%' OR slot_config::text LIKE '%upper_back%';

-- Merge triceps_lateral and triceps_medial into triceps_lat_med
UPDATE muscle_program_templates
SET slot_config = REPLACE(REPLACE(
  slot_config::text,
  '"triceps_lateral"', '"triceps_lat_med"'),
  '"triceps_medial"', '"triceps_lat_med"'
)::jsonb
WHERE slot_config::text LIKE '%triceps_lateral%' OR slot_config::text LIKE '%triceps_medial%';

-- Update day_modules.source_muscle_id (only this table has it)
UPDATE day_modules SET source_muscle_id = 'upper_mid_back' WHERE source_muscle_id IN ('mid_back', 'upper_back');
UPDATE day_modules SET source_muscle_id = 'triceps_lat_med' WHERE source_muscle_id IN ('triceps_lateral', 'triceps_medial');
