-- ============================================================
-- exercise_library v2 sync
-- Applies structural changes reflected in IGU_MASTER_EXERCISE_LIBRARY_v2.md
-- that are not yet in movement_patterns or exercise_library.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. MOVEMENT_PATTERNS — renames and deletes
-- ──────────────────────────────────────────────────────────────

-- Lower Traps: "Scapular Depression" → "Pull-Apart"
UPDATE movement_patterns
SET movement = 'Pull-Apart'
WHERE muscle_group = 'upper_mid_back'
  AND subdivision = 'mid_back_low_traps'
  AND movement = 'Scapular Depression';

-- Teres Major: "Pulldown / Row (internal rotation emphasis)" → "Pullover"
UPDATE movement_patterns
SET movement = 'Pullover'
WHERE muscle_group = 'upper_mid_back'
  AND subdivision = 'upper_back_teres_major'
  AND movement = 'Pulldown / Row (internal rotation emphasis)';

-- Teres Major: delete Row + Reverse Fly added in 20260420 (Teres Major is Pullover-only in v2)
DELETE FROM movement_patterns
WHERE muscle_group = 'upper_mid_back'
  AND subdivision = 'upper_back_teres_major'
  AND movement IN ('Row', 'Reverse Fly');

-- Glute Max: "Thrust / Bridge" → "Thrust" (Bridge already exists as separate movement from 20260422)
UPDATE movement_patterns
SET movement = 'Thrust'
WHERE muscle_group = 'glutes'
  AND subdivision = 'glutes_max'
  AND movement = 'Thrust / Bridge';


-- ──────────────────────────────────────────────────────────────
-- 2. EXERCISE_LIBRARY — movement_pattern text sync
-- ──────────────────────────────────────────────────────────────

-- Lower Traps exercises: sync movement_pattern text
UPDATE exercise_library
SET movement_pattern = 'Pull-Apart'
WHERE muscle_group = 'upper_mid_back'
  AND subdivision = 'mid_back_low_traps'
  AND movement_pattern = 'Scapular Depression';

-- Teres Major: rename C-FT Straight Arm Pulldown + update movement_pattern
UPDATE exercise_library
SET name            = 'Teres Major C-FT Straight Arm Pulldown / Pullover (L)',
    movement_pattern = 'Pullover'
WHERE name = 'Teres Major C-FT Straight Arm Pulldown (L)'
  AND muscle_group = 'upper_mid_back'
  AND subdivision  = 'upper_back_teres_major';

-- Teres Major: update movement_pattern for DB Narrow Pullover
UPDATE exercise_library
SET movement_pattern = 'Pullover'
WHERE name = 'Teres Major DB Narrow Pullover (L)'
  AND muscle_group = 'upper_mid_back'
  AND subdivision  = 'upper_back_teres_major';

-- Teres Major: deactivate Row + Pulldown exercises removed from v2
UPDATE exercise_library
SET is_active = false
WHERE name IN (
  'Teres Major M Close Grip Pronated Pulldown (L)',
  'Teres Major C-FT Neutral Grip Elbows-Tight Row (M)'
)
  AND muscle_group = 'upper_mid_back'
  AND subdivision  = 'upper_back_teres_major';

-- Glute Max: split "Thrust / Bridge" into separate movement_pattern values
-- Hip Thrusts → 'Thrust'
UPDATE exercise_library
SET movement_pattern = 'Thrust'
WHERE muscle_group = 'glutes'
  AND subdivision  = 'glutes_max'
  AND movement_pattern = 'Thrust / Bridge'
  AND name LIKE '%Hip Thrust%';

-- BB Glute Bridge → 'Bridge'
UPDATE exercise_library
SET movement_pattern = 'Bridge'
WHERE name = 'Glute Max BB Glute Bridge (S)'
  AND muscle_group = 'glutes'
  AND subdivision  = 'glutes_max';

-- Core: deactivate Hanging Oblique Raise (was under Lateral Flexion, which is removed in v2)
UPDATE exercise_library
SET is_active = false
WHERE name = 'Abs BW Hanging Oblique Raise (L)'
  AND muscle_group = 'core';


-- ──────────────────────────────────────────────────────────────
-- 3. EXERCISE_LIBRARY — insert new exercises
-- ──────────────────────────────────────────────────────────────

-- Upper Traps — Raise (movement inserted in 20260419; exercises were never seeded)
INSERT INTO exercise_library
  (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_active)
VALUES
  ('Upper Traps DB Wide Raise (S)',   'Traps', ARRAY['Lateral Delts', 'Lower Traps'], 'DB',   'strength', 'upper_mid_back', 'upper_back_upper_traps', 'Raise', ARRAY['Shortened'], true),
  ('Upper Traps C-FT Wide Raise (L)', 'Traps', ARRAY['Lateral Delts', 'Lower Traps'], 'C-FT', 'strength', 'upper_mid_back', 'upper_back_upper_traps', 'Raise', ARRAY['Lengthened'], true),
  ('Upper Traps C-AA Wide Raise (L)', 'Traps', ARRAY['Lateral Delts', 'Lower Traps'], 'C-AA', 'strength', 'upper_mid_back', 'upper_back_upper_traps', 'Raise', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Glute Max — Bridge (BW variation; BB was in v1 seed)
INSERT INTO exercise_library
  (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_active)
VALUES
  ('Glute Max BW Glute Bridge (S)', 'Glutes', ARRAY['Hamstrings'], 'BW', 'strength', 'glutes', 'glutes_max', 'Bridge', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- Glute Med — Kickback (movement inserted in 20260422)
INSERT INTO exercise_library
  (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_active)
VALUES
  ('Glute Med C-FT Kickback (L)',    'Glutes', ARRAY['Glute Max', 'Hamstrings'], 'C-FT', 'strength', 'glutes', 'glutes_med', 'Kickback', ARRAY['Lengthened'], true),
  ('Glute Med C-AA Kickback (L)',    'Glutes', ARRAY['Glute Max', 'Hamstrings'], 'C-AA', 'strength', 'glutes', 'glutes_med', 'Kickback', ARRAY['Lengthened'], true),
  ('Glute Med BW Band Kickback (L)', 'Glutes', ARRAY['Glute Max', 'Hamstrings'], 'BW',   'strength', 'glutes', 'glutes_med', 'Kickback', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Glute Med — Extension (movement inserted in 20260422)
INSERT INTO exercise_library
  (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_active)
VALUES
  ('Glute Med C-FT Standing Hip Extension (L)', 'Glutes', ARRAY['Glute Max', 'Hamstrings'], 'C-FT', 'strength', 'glutes', 'glutes_med', 'Extension', ARRAY['Lengthened'], true),
  ('Glute Med M Hip Extension (L)',              'Glutes', ARRAY['Glute Max', 'Hamstrings'], 'M',    'strength', 'glutes', 'glutes_med', 'Extension', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Glute Med — Squat / Press (movement inserted in 20260422)
INSERT INTO exercise_library
  (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_active)
VALUES
  ('Glute Med DB Bulgarian Split Squat (L)', 'Glutes', ARRAY['Quads', 'Glute Max'], 'DB', 'strength', 'glutes', 'glutes_med', 'Squat / Press', ARRAY['Lengthened'], true),
  ('Glute Med M Single-Leg Press (M)',        'Glutes', ARRAY['Quads', 'Glute Max'], 'M',  'strength', 'glutes', 'glutes_med', 'Squat / Press', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;
