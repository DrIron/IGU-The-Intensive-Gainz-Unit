-- ============================================================
-- Convert execution_text and setup_instructions to TEXT[] arrays
-- for structured bullet point editing and display
-- ============================================================

-- 1. Add execution_points TEXT[] to movement_patterns
ALTER TABLE movement_patterns ADD COLUMN IF NOT EXISTS execution_points TEXT[] DEFAULT '{}';

-- Migrate existing text data: split by newline into array elements
UPDATE movement_patterns
SET execution_points = array_remove(string_to_array(execution_text, E'\n'), '')
WHERE execution_text IS NOT NULL AND execution_text != '' AND (execution_points IS NULL OR execution_points = '{}');

-- 2. Add setup_points TEXT[] to exercise_library
ALTER TABLE exercise_library ADD COLUMN IF NOT EXISTS setup_points TEXT[] DEFAULT '{}';

-- Migrate existing text data
UPDATE exercise_library
SET setup_points = array_remove(string_to_array(setup_instructions, E'\n'), '')
WHERE setup_instructions IS NOT NULL AND setup_instructions != '' AND (setup_points IS NULL OR setup_points = '{}');
