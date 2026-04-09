-- =============================================================================
-- EXERCISE LIBRARY V2: Movement Patterns + Full IGU Master Exercise Library
-- =============================================================================
-- Parsed from IGU_MASTER_EXERCISE_LIBRARY.md (1623 lines, 21 sections, ~357 exercises)
-- Migration date: 2026-04-09
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CREATE movement_patterns TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.movement_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  muscle_group TEXT NOT NULL,
  subdivision TEXT,
  movement TEXT NOT NULL,
  execution_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique index on (muscle_group, subdivision, movement) with COALESCE for NULLs
CREATE UNIQUE INDEX IF NOT EXISTS idx_movement_patterns_unique
  ON public.movement_patterns (muscle_group, COALESCE(subdivision, ''), movement);

ALTER TABLE public.movement_patterns ENABLE ROW LEVEL SECURITY;

-- Authenticated users can SELECT
CREATE POLICY "Authenticated can view movement patterns"
  ON public.movement_patterns FOR SELECT
  TO authenticated
  USING (true);

-- Admin full access
CREATE POLICY "Admin full access to movement patterns"
  ON public.movement_patterns FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- =============================================================================
-- 2. ALTER exercise_library — add new taxonomy columns
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercise_library' AND column_name='muscle_group') THEN
    ALTER TABLE public.exercise_library ADD COLUMN muscle_group TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercise_library' AND column_name='subdivision') THEN
    ALTER TABLE public.exercise_library ADD COLUMN subdivision TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercise_library' AND column_name='movement_pattern') THEN
    ALTER TABLE public.exercise_library ADD COLUMN movement_pattern TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercise_library' AND column_name='resistance_profiles') THEN
    ALTER TABLE public.exercise_library ADD COLUMN resistance_profiles TEXT[];
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercise_library' AND column_name='machine_brand') THEN
    ALTER TABLE public.exercise_library ADD COLUMN machine_brand TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercise_library' AND column_name='setup_instructions') THEN
    ALTER TABLE public.exercise_library ADD COLUMN setup_instructions TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='exercise_library' AND column_name='movement_pattern_id') THEN
    ALTER TABLE public.exercise_library ADD COLUMN movement_pattern_id UUID REFERENCES public.movement_patterns(id) ON DELETE SET NULL;
  END IF;
END$$;

-- =============================================================================
-- 3. BACKFILL existing 107 exercises with muscle_group based on primary_muscle
-- =============================================================================

UPDATE public.exercise_library SET muscle_group = 'pecs' WHERE muscle_group IS NULL AND primary_muscle IN ('Chest', 'Upper Chest');
UPDATE public.exercise_library SET muscle_group = 'shoulders' WHERE muscle_group IS NULL AND primary_muscle IN ('Shoulders', 'Front Delts', 'Side Delts', 'Rear Delts');
UPDATE public.exercise_library SET muscle_group = 'elbow_flexors' WHERE muscle_group IS NULL AND primary_muscle IN ('Biceps', 'Brachialis');
UPDATE public.exercise_library SET muscle_group = 'triceps' WHERE muscle_group IS NULL AND primary_muscle = 'Triceps';
UPDATE public.exercise_library SET muscle_group = 'forearm' WHERE muscle_group IS NULL AND primary_muscle = 'Forearms';
UPDATE public.exercise_library SET muscle_group = 'upper_mid_back' WHERE muscle_group IS NULL AND primary_muscle IN ('Upper Back', 'Traps');
UPDATE public.exercise_library SET muscle_group = 'lats' WHERE muscle_group IS NULL AND primary_muscle = 'Lats';
UPDATE public.exercise_library SET muscle_group = 'core' WHERE muscle_group IS NULL AND primary_muscle IN ('Core', 'Abs');
UPDATE public.exercise_library SET muscle_group = 'glutes' WHERE muscle_group IS NULL AND primary_muscle = 'Glutes';
UPDATE public.exercise_library SET muscle_group = 'quads' WHERE muscle_group IS NULL AND primary_muscle = 'Quadriceps';
UPDATE public.exercise_library SET muscle_group = 'hamstrings' WHERE muscle_group IS NULL AND primary_muscle = 'Hamstrings';
UPDATE public.exercise_library SET muscle_group = 'calves' WHERE muscle_group IS NULL AND primary_muscle = 'Calves';
UPDATE public.exercise_library SET muscle_group = 'rotator_cuff' WHERE muscle_group IS NULL AND primary_muscle = 'Rotator Cuff';
UPDATE public.exercise_library SET muscle_group = 'serratus' WHERE muscle_group IS NULL AND primary_muscle = 'Serratus';
UPDATE public.exercise_library SET muscle_group = 'adductors' WHERE muscle_group IS NULL AND primary_muscle = 'Adductors';
UPDATE public.exercise_library SET muscle_group = 'abductors' WHERE muscle_group IS NULL AND primary_muscle = 'Abductors';
UPDATE public.exercise_library SET muscle_group = 'hip_flexors' WHERE muscle_group IS NULL AND primary_muscle = 'Hip Flexors';
UPDATE public.exercise_library SET muscle_group = 'cardio' WHERE muscle_group IS NULL AND primary_muscle = 'Cardiovascular';
UPDATE public.exercise_library SET muscle_group = 'neck' WHERE muscle_group IS NULL AND primary_muscle = 'Neck';

-- =============================================================================
-- 4. SEED movement_patterns — one row per movement in the document
-- =============================================================================

INSERT INTO public.movement_patterns (muscle_group, subdivision, movement) VALUES
-- 1. CHEST
('pecs', 'pecs_clavicular', 'Press'),
('pecs', 'pecs_clavicular', 'Fly'),
('pecs', 'pecs_clavicular', 'Pressaround'),
('pecs', 'pecs_sternal', 'Press'),
('pecs', 'pecs_sternal', 'Fly'),
('pecs', 'pecs_sternal', 'Pressaround'),
('pecs', 'pecs_costal', 'Press'),
('pecs', 'pecs_costal', 'Fly'),
('pecs', 'pecs_costal', 'Pressaround'),
-- 2. SHOULDERS
('shoulders', 'shoulders_anterior', 'Press'),
('shoulders', 'shoulders_anterior', 'Raise'),
('shoulders', 'shoulders_lateral', 'Raise'),
('shoulders', 'shoulders_lateral', 'Y-Raise'),
('shoulders', 'shoulders_posterior', 'Reverse Fly'),
-- 3. ROTATOR CUFF
('rotator_cuff', 'rotator_cuff_supraspinatus', 'Scaption / Abduction (initial range)'),
('rotator_cuff', 'rotator_cuff_infraspinatus', 'External Rotation'),
('rotator_cuff', 'rotator_cuff_subscapularis', 'Internal Rotation'),
-- 4. SERRATUS
('serratus', 'serratus_anterior', 'Protraction'),
-- 5. ELBOW FLEXORS
('elbow_flexors', 'elbow_flexors_biceps_long', 'Curl (shoulder extended -- lengthened)'),
('elbow_flexors', 'elbow_flexors_biceps_long', 'Curl (shoulder neutral/flexed -- shortened)'),
('elbow_flexors', 'elbow_flexors_biceps_short', 'Curl (shoulder flexed -- lengthened)'),
('elbow_flexors', 'elbow_flexors_biceps_short', 'Curl (shortened)'),
('elbow_flexors', NULL, 'Curl'),
('elbow_flexors', 'elbow_flexors_brachialis', 'Hammer / Reverse Curl'),
('elbow_flexors', 'elbow_flexors_brachioradialis', 'Reverse Curl'),
-- 6. TRICEPS
('triceps', 'triceps_long', 'Overhead Extension (scapular plane)'),
('triceps', 'triceps_long', 'Extension with Shoulder Extension (scapular aligned)'),
('triceps', 'triceps_lateral', 'Pushdown / Pressdown'),
('triceps', 'triceps_lateral', 'Extension / Press (non-scapular)'),
-- 7. FOREARMS
('forearm', 'forearm_flexors', 'Wrist Curl'),
('forearm', 'forearm_extensors', 'Reverse Wrist Curl'),
('forearm', 'forearm_pronators', 'Pronation'),
('forearm', 'forearm_supinators', 'Supination'),
-- 8. UPPER / MID BACK
('upper_mid_back', 'upper_back_upper_traps', 'Shrug'),
('upper_mid_back', 'mid_back_mid_traps', 'Retraction Row / Face Pull'),
('upper_mid_back', 'mid_back_low_traps', 'Scapular Depression'),
('upper_mid_back', 'mid_back_rhomboids', 'Row (retraction emphasis)'),
('upper_mid_back', 'upper_back_teres_major', 'Pulldown / Row (internal rotation emphasis)'),
-- 9. LATS
('lats', 'lats_thoracic', 'Pulldown (wide/overhand)'),
('lats', 'lats_thoracic', 'Row'),
('lats', 'lats_thoracic', 'Pull Around'),
('lats', 'lats_lumbar', 'Row (narrow)'),
('lats', 'lats_lumbar', 'Pull Around'),
('lats', 'lats_iliac', 'Pulldown (close/underhand)'),
('lats', 'lats_iliac', 'Pull Around'),
('lats', 'lats_iliac', 'Straight-Arm Pulldown / Pullover'),
-- 10. CORE
('core', 'core_rectus_abdominis', 'Spinal Flexion'),
('core', 'core_rectus_abdominis', 'Anti-Extension'),
('core', 'core_rectus_abdominis', 'Rotation'),
('core', 'core_rectus_abdominis', 'Anti-Rotation'),
('core', 'core_rectus_abdominis', 'Lateral Flexion'),
('core', 'core_erectors', 'Spinal Extension'),
('core', 'core_erectors', 'Anti-Flexion'),
-- 11. GLUTES
('glutes', 'glutes_max', 'Hip Hinge'),
('glutes', 'glutes_max', 'Thrust / Bridge'),
('glutes', 'glutes_max', 'Squat / Press (glute emphasis)'),
('glutes', 'glutes_med', 'Abduction'),
-- 12. HIP FLEXORS
('hip_flexors', NULL, 'Hip Flexion'),
-- 13. ADDUCTORS
('adductors', NULL, 'Adduction'),
-- 14. ABDUCTORS
('abductors', NULL, 'Internal-Rotation-Biased Abduction'),
-- 15. QUADRICEPS
('quads', 'quads_rectus_femoris', 'Knee Extension (hip neutral/extended)'),
('quads', NULL, 'Squat'),
-- 16. HAMSTRINGS
('hamstrings', NULL, 'Leg Curl'),
('hamstrings', NULL, 'Hip Hinge (hamstring emphasis)'),
-- 17. CALVES
('calves', 'calves_gastrocnemius', 'Calf Raise (knee straight)'),
('calves', 'calves_soleus', 'Calf Raise (knee bent)'),
('calves', 'tibialis_anterior', 'Dorsiflexion'),
-- 18. NECK
('neck', NULL, 'Flexion / Extension'),
('neck', NULL, 'Lateral Flexion'),
-- 19. CARDIO
('cardio', NULL, 'Machine Cardio'),
('cardio', NULL, 'Functional Cardio'),
-- 20. MOBILITY
('mobility', NULL, 'Foam Rolling'),
('mobility', NULL, 'Dynamic Mobility'),
-- 21. WARMUP
('warmup', NULL, 'Activation'),
('warmup', NULL, 'Dynamic Warmup')
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 5. SEED new exercises — every table row from the master library
-- =============================================================================
-- Uses ON CONFLICT (name) DO NOTHING to avoid duplicates with existing 107 exercises.
-- We need a unique constraint on name for this to work.
-- =============================================================================

-- Add unique constraint on name if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'exercise_library_name_unique'
  ) THEN
    ALTER TABLE public.exercise_library ADD CONSTRAINT exercise_library_name_unique UNIQUE (name);
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- 1.1 Clavicular Head (Upper Chest)
-- ---------------------------------------------------------------------------
-- Movement 1: Press
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Clavicular Pec BB Incline Press (M)', 'Upper Chest', ARRAY['Triceps', 'Front Delts'], 'BB', 'strength', 'pecs', 'pecs_clavicular', 'Press', ARRAY['Mid-range'], true),
('Clavicular Pec M Smith Incline Press (M)', 'Upper Chest', ARRAY['Triceps', 'Front Delts'], 'M', 'strength', 'pecs', 'pecs_clavicular', 'Press', ARRAY['Mid-range'], true),
('Clavicular Pec DB Incline Press (L)', 'Upper Chest', ARRAY['Triceps', 'Front Delts'], 'DB', 'strength', 'pecs', 'pecs_clavicular', 'Press', ARRAY['Lengthened'], true),
('Clavicular Pec M Incline Press (M)', 'Upper Chest', ARRAY['Triceps', 'Front Delts'], 'M', 'strength', 'pecs', 'pecs_clavicular', 'Press', ARRAY['Mid-range'], true),
('Clavicular Pec C-FS Seated Press (S)', 'Upper Chest', ARRAY['Triceps', 'Front Delts'], 'C-FS', 'strength', 'pecs', 'pecs_clavicular', 'Press', ARRAY['Shortened'], true),
('Clavicular Pec C-AA Standing Press (M)', 'Upper Chest', ARRAY['Triceps', 'Front Delts'], 'C-AA', 'strength', 'pecs', 'pecs_clavicular', 'Press', ARRAY['Mid-range'], true),
('Clavicular Pec C-FT Press (M)', 'Upper Chest', ARRAY['Triceps', 'Front Delts'], 'C-FT', 'strength', 'pecs', 'pecs_clavicular', 'Press', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Fly
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Clavicular Pec C-FT/C-AA Fly (L)', 'Upper Chest', ARRAY['Front Delts'], 'C-FT / C-AA', 'strength', 'pecs', 'pecs_clavicular', 'Fly', ARRAY['Lengthened'], true),
('Clavicular Pec M Fly (S)', 'Upper Chest', ARRAY['Front Delts'], 'M', 'strength', 'pecs', 'pecs_clavicular', 'Fly', ARRAY['Shortened'], true),
('Clavicular Pec C-FS Seated Fly (S)', 'Upper Chest', ARRAY['Front Delts'], 'C-FS', 'strength', 'pecs', 'pecs_clavicular', 'Fly', ARRAY['Shortened'], true),
('Clavicular Pec DB Incline Fly (L)', 'Upper Chest', ARRAY['Front Delts'], 'DB', 'strength', 'pecs', 'pecs_clavicular', 'Fly', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 3: Pressaround
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Clavicular Pec C-FT/C-AA Pressaround (M)', 'Upper Chest', ARRAY['Triceps', 'Front Delts'], 'C-FT / C-AA', 'strength', 'pecs', 'pecs_clavicular', 'Pressaround', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1.2 Sternal Head (Mid Chest)
-- ---------------------------------------------------------------------------
-- Movement 1: Press
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Sternal Pec BB Flat Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'BB', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Mid-range'], true),
('Sternal Pec M Smith Flat Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'M', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Mid-range'], true),
('Sternal Pec DB Flat Press (L)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'DB', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Lengthened'], true),
('Sternal Pec DB Low Incline Press (L)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'DB', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Lengthened'], true),
('Sternal Pec M Seated Upright Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'M', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Mid-range'], true),
('Sternal Pec M Semi-Upright Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'M', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Mid-range'], true),
('Sternal Pec M Flat Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'M', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Mid-range'], true),
('Sternal Pec C-FS Seated Press (S)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'C-FS', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Shortened'], true),
('Sternal Pec C-AA Standing Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'C-AA', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Mid-range'], true),
('Sternal Pec C-FT Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'C-FT', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Mid-range'], true),
('Sternal Pec BW Push-Up (M)', 'Chest', ARRAY['Triceps', 'Front Delts', 'Core'], 'BW', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Mid-range'], true),
('Sternal Pec BB Floor Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'BB', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Mid-range'], true),
('Sternal Pec DB Floor Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'DB', 'strength', 'pecs', 'pecs_sternal', 'Press', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Fly
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Sternal Pec C-FT/C-AA Fly (L)', 'Chest', ARRAY['Front Delts'], 'C-FT / C-AA', 'strength', 'pecs', 'pecs_sternal', 'Fly', ARRAY['Lengthened'], true),
('Sternal Pec M Flat Fly (S)', 'Chest', ARRAY['Front Delts'], 'M', 'strength', 'pecs', 'pecs_sternal', 'Fly', ARRAY['Shortened'], true),
('Sternal Pec C-FS Seated Fly (S)', 'Chest', ARRAY['Front Delts'], 'C-FS', 'strength', 'pecs', 'pecs_sternal', 'Fly', ARRAY['Shortened'], true),
('Sternal Pec DB Flat Fly (L)', 'Chest', ARRAY['Front Delts'], 'DB', 'strength', 'pecs', 'pecs_sternal', 'Fly', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 3: Pressaround
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Sternal Pec C-FT/C-AA Pressaround (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'C-FT / C-AA', 'strength', 'pecs', 'pecs_sternal', 'Pressaround', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 1.3 Costal Head (Lower Chest)
-- ---------------------------------------------------------------------------
-- Movement 1: Press
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Costal Pec BB Decline Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'BB', 'strength', 'pecs', 'pecs_costal', 'Press', ARRAY['Mid-range'], true),
('Costal Pec M Smith Decline Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'M', 'strength', 'pecs', 'pecs_costal', 'Press', ARRAY['Mid-range'], true),
('Costal Pec DB Decline Press (L)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'DB', 'strength', 'pecs', 'pecs_costal', 'Press', ARRAY['Lengthened'], true),
('Costal Pec M High-to-Low Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'M', 'strength', 'pecs', 'pecs_costal', 'Press', ARRAY['Mid-range'], true),
('Costal Pec C-AA Standing High-to-Low Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'C-AA', 'strength', 'pecs', 'pecs_costal', 'Press', ARRAY['Mid-range'], true),
('Costal Pec C-FT High-to-Low Press (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'C-FT', 'strength', 'pecs', 'pecs_costal', 'Press', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Fly
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Costal Pec C-FT/C-AA High-to-Low Fly (L)', 'Chest', ARRAY['Front Delts'], 'C-FT / C-AA', 'strength', 'pecs', 'pecs_costal', 'Fly', ARRAY['Lengthened'], true),
('Costal Pec DB Decline Fly (L)', 'Chest', ARRAY['Front Delts'], 'DB', 'strength', 'pecs', 'pecs_costal', 'Fly', ARRAY['Lengthened'], true),
('Costal Pec M Decline Fly (S)', 'Chest', ARRAY['Front Delts'], 'M', 'strength', 'pecs', 'pecs_costal', 'Fly', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 3: Pressaround
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Costal Pec C-FT/C-AA High-to-Low Pressaround (M)', 'Chest', ARRAY['Triceps', 'Front Delts'], 'C-FT / C-AA', 'strength', 'pecs', 'pecs_costal', 'Pressaround', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2.1 Anterior Deltoid
-- ---------------------------------------------------------------------------
-- Movement 1: Press
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Anterior Delt BB Seated Overhead Press (M)', 'Front Delts', ARRAY['Triceps', 'Lateral Delts', 'Upper Chest'], 'BB', 'strength', 'shoulders', 'shoulders_anterior', 'Press', ARRAY['Mid-range'], true),
('Anterior Delt BB Standing Overhead Press (M)', 'Front Delts', ARRAY['Triceps', 'Lateral Delts', 'Core'], 'BB', 'strength', 'shoulders', 'shoulders_anterior', 'Press', ARRAY['Mid-range'], true),
('Anterior Delt DB Seated Overhead Press (M)', 'Front Delts', ARRAY['Triceps', 'Lateral Delts'], 'DB', 'strength', 'shoulders', 'shoulders_anterior', 'Press', ARRAY['Mid-range'], true),
('Anterior Delt DB Standing Overhead Press (M)', 'Front Delts', ARRAY['Triceps', 'Lateral Delts', 'Core'], 'DB', 'strength', 'shoulders', 'shoulders_anterior', 'Press', ARRAY['Mid-range'], true),
('Anterior Delt M Smith Overhead Press (M)', 'Front Delts', ARRAY['Triceps', 'Lateral Delts'], 'M', 'strength', 'shoulders', 'shoulders_anterior', 'Press', ARRAY['Mid-range'], true),
('Anterior Delt M Seated Overhead Press (M)', 'Front Delts', ARRAY['Triceps', 'Lateral Delts'], 'M', 'strength', 'shoulders', 'shoulders_anterior', 'Press', ARRAY['Mid-range'], true),
('Anterior Delt C-FT Overhead Press (M)', 'Front Delts', ARRAY['Triceps', 'Lateral Delts'], 'C-FT', 'strength', 'shoulders', 'shoulders_anterior', 'Press', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Raise
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Anterior Delt DB Front Raise (S)', 'Front Delts', ARRAY['Upper Chest'], 'DB', 'strength', 'shoulders', 'shoulders_anterior', 'Raise', ARRAY['Shortened'], true),
('Anterior Delt BB Front Raise (M)', 'Front Delts', ARRAY['Upper Chest'], 'BB', 'strength', 'shoulders', 'shoulders_anterior', 'Raise', ARRAY['Mid-range'], true),
('Anterior Delt C-FT Front Raise (L)', 'Front Delts', ARRAY['Upper Chest'], 'C-FT', 'strength', 'shoulders', 'shoulders_anterior', 'Raise', ARRAY['Lengthened'], true),
('Anterior Delt C-AA Front Raise (L)', 'Front Delts', ARRAY['Upper Chest'], 'C-AA', 'strength', 'shoulders', 'shoulders_anterior', 'Raise', ARRAY['Lengthened'], true),
('Anterior Delt DB Plate Front Raise (S)', 'Front Delts', ARRAY['Upper Chest'], 'DB (plate)', 'strength', 'shoulders', 'shoulders_anterior', 'Raise', ARRAY['Shortened'], true),
('Anterior Delt M Front Raise (M)', 'Front Delts', ARRAY['Upper Chest'], 'M', 'strength', 'shoulders', 'shoulders_anterior', 'Raise', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2.2 Lateral Deltoid
-- ---------------------------------------------------------------------------
-- Movement 1: Raise
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Lateral Delt DB Standing Lateral Raise (S)', 'Side Delts', ARRAY['Traps (upper)'], 'DB', 'strength', 'shoulders', 'shoulders_lateral', 'Raise', ARRAY['Shortened'], true),
('Lateral Delt DB Seated Lateral Raise (S)', 'Side Delts', ARRAY['Traps (upper)'], 'DB', 'strength', 'shoulders', 'shoulders_lateral', 'Raise', ARRAY['Shortened'], true),
('Lateral Delt C-FT Lateral Raise (L)', 'Side Delts', ARRAY['Traps (upper)'], 'C-FT', 'strength', 'shoulders', 'shoulders_lateral', 'Raise', ARRAY['Lengthened'], true),
('Lateral Delt C-AA Lateral Raise (L)', 'Side Delts', ARRAY['Traps (upper)'], 'C-AA', 'strength', 'shoulders', 'shoulders_lateral', 'Raise', ARRAY['Lengthened'], true),
('Lateral Delt M Lateral Raise (S)', 'Side Delts', ARRAY['Traps (upper)'], 'M', 'strength', 'shoulders', 'shoulders_lateral', 'Raise', ARRAY['Shortened'], true),
('Lateral Delt DB Leaning Lateral Raise (L)', 'Side Delts', ARRAY['Traps (upper)'], 'DB', 'strength', 'shoulders', 'shoulders_lateral', 'Raise', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Y-Raise
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Lateral Delt DB Y-Raise (S)', 'Side Delts', ARRAY['Traps (lower)', 'Serratus'], 'DB', 'strength', 'shoulders', 'shoulders_lateral', 'Y-Raise', ARRAY['Shortened'], true),
('Lateral Delt C-FT Y-Raise (L)', 'Side Delts', ARRAY['Traps (lower)', 'Serratus'], 'C-FT', 'strength', 'shoulders', 'shoulders_lateral', 'Y-Raise', ARRAY['Lengthened'], true),
('Lateral Delt C-AA Y-Raise (L)', 'Side Delts', ARRAY['Traps (lower)', 'Serratus'], 'C-AA', 'strength', 'shoulders', 'shoulders_lateral', 'Y-Raise', ARRAY['Lengthened'], true),
('Lateral Delt BW Band Y-Raise (S)', 'Side Delts', ARRAY['Traps (lower)', 'Serratus'], 'BW', 'strength', 'shoulders', 'shoulders_lateral', 'Y-Raise', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2.3 Posterior Deltoid
-- ---------------------------------------------------------------------------
-- Movement 1: Reverse Fly
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Posterior Delt DB Bent Over Reverse Fly (S)', 'Rear Delts', ARRAY['Mid Traps', 'Rhomboids'], 'DB', 'strength', 'shoulders', 'shoulders_posterior', 'Reverse Fly', ARRAY['Shortened'], true),
('Posterior Delt C-FT Reverse Fly (L)', 'Rear Delts', ARRAY['Mid Traps', 'Rhomboids'], 'C-FT', 'strength', 'shoulders', 'shoulders_posterior', 'Reverse Fly', ARRAY['Lengthened'], true),
('Posterior Delt C-AA Reverse Fly (L)', 'Rear Delts', ARRAY['Mid Traps', 'Rhomboids'], 'C-AA', 'strength', 'shoulders', 'shoulders_posterior', 'Reverse Fly', ARRAY['Lengthened'], true),
('Posterior Delt M Reverse Fly (S)', 'Rear Delts', ARRAY['Mid Traps', 'Rhomboids'], 'M', 'strength', 'shoulders', 'shoulders_posterior', 'Reverse Fly', ARRAY['Shortened'], true),
('Posterior Delt DB Incline Chest-Supported Reverse Fly (S)', 'Rear Delts', ARRAY['Mid Traps', 'Rhomboids'], 'DB', 'strength', 'shoulders', 'shoulders_posterior', 'Reverse Fly', ARRAY['Shortened'], true),
('Posterior Delt C-FT Single Arm Crossbody Reverse Fly (L)', 'Rear Delts', ARRAY['Mid Traps', 'Rhomboids'], 'C-FT', 'strength', 'shoulders', 'shoulders_posterior', 'Reverse Fly', ARRAY['Lengthened'], true),
('Posterior Delt C-AA Single Arm Crossbody Reverse Fly (L)', 'Rear Delts', ARRAY['Mid Traps', 'Rhomboids'], 'C-AA', 'strength', 'shoulders', 'shoulders_posterior', 'Reverse Fly', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3.1 Supraspinatus
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Supraspinatus DB Scaption Raise (S)', 'Rotator Cuff', ARRAY['Lateral Delts'], 'DB', 'strength', 'rotator_cuff', 'rotator_cuff_supraspinatus', 'Scaption / Abduction (initial range)', ARRAY['Shortened'], true),
('Supraspinatus C-FT Scaption Raise (L)', 'Rotator Cuff', ARRAY['Lateral Delts'], 'C-FT', 'strength', 'rotator_cuff', 'rotator_cuff_supraspinatus', 'Scaption / Abduction (initial range)', ARRAY['Lengthened'], true),
('Supraspinatus BW Band Scaption Raise (S)', 'Rotator Cuff', ARRAY['Lateral Delts'], 'BW', 'strength', 'rotator_cuff', 'rotator_cuff_supraspinatus', 'Scaption / Abduction (initial range)', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3.2 Infraspinatus
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Infraspinatus C-FT Arm-at-Side External Rotation (L)', 'Rotator Cuff', ARRAY['Teres Minor'], 'C-FT', 'strength', 'rotator_cuff', 'rotator_cuff_infraspinatus', 'External Rotation', ARRAY['Lengthened'], true),
('Infraspinatus C-FT 90-Degree Abducted External Rotation (M)', 'Rotator Cuff', ARRAY['Teres Minor'], 'C-FT', 'strength', 'rotator_cuff', 'rotator_cuff_infraspinatus', 'External Rotation', ARRAY['Mid-range'], true),
('Infraspinatus DB Side-Lying External Rotation (L)', 'Rotator Cuff', ARRAY['Teres Minor'], 'DB', 'strength', 'rotator_cuff', 'rotator_cuff_infraspinatus', 'External Rotation', ARRAY['Lengthened'], true),
('Infraspinatus BW Band External Rotation (S)', 'Rotator Cuff', ARRAY['Teres Minor'], 'BW', 'strength', 'rotator_cuff', 'rotator_cuff_infraspinatus', 'External Rotation', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3.3 Subscapularis
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Subscapularis C-FT Arm-at-Side Internal Rotation (L)', 'Rotator Cuff', ARRAY['Pectoralis Major'], 'C-FT', 'strength', 'rotator_cuff', 'rotator_cuff_subscapularis', 'Internal Rotation', ARRAY['Lengthened'], true),
('Subscapularis C-FT 90-Degree Abducted Internal Rotation (M)', 'Rotator Cuff', ARRAY['Pectoralis Major'], 'C-FT', 'strength', 'rotator_cuff', 'rotator_cuff_subscapularis', 'Internal Rotation', ARRAY['Mid-range'], true),
('Subscapularis BW Band Internal Rotation (S)', 'Rotator Cuff', ARRAY['Pectoralis Major'], 'BW', 'strength', 'rotator_cuff', 'rotator_cuff_subscapularis', 'Internal Rotation', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- 3.4 Teres Minor — shares exercises with Infraspinatus, no separate inserts needed

-- ---------------------------------------------------------------------------
-- 4.1 Serratus Anterior
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Serratus BW Push-Up Plus (S)', 'Serratus', ARRAY['Triceps', 'Front Delts'], 'BW', 'strength', 'serratus', 'serratus_anterior', 'Protraction', ARRAY['Shortened'], true),
('Serratus C-FT Punch (S)', 'Serratus', ARRAY['Front Delts'], 'C-FT', 'strength', 'serratus', 'serratus_anterior', 'Protraction', ARRAY['Shortened'], true),
('Serratus C-AA Punch (S)', 'Serratus', ARRAY['Front Delts'], 'C-AA', 'strength', 'serratus', 'serratus_anterior', 'Protraction', ARRAY['Shortened'], true),
('Serratus DB Lying Press (S)', 'Serratus', ARRAY['Front Delts', 'Triceps'], 'DB', 'strength', 'serratus', 'serratus_anterior', 'Protraction', ARRAY['Shortened'], true),
('Serratus BW Band Punch (S)', 'Serratus', ARRAY['Front Delts'], 'BW', 'strength', 'serratus', 'serratus_anterior', 'Protraction', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5.1 Biceps Long Head
-- ---------------------------------------------------------------------------
-- Movement 1: Curl (shoulder extended -- lengthened)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Biceps Long DB Incline Curl (L)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'DB', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_long', 'Curl (shoulder extended -- lengthened)', ARRAY['Lengthened'], true),
('Biceps Long C-FT Bayesian Curl (L)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'C-FT', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_long', 'Curl (shoulder extended -- lengthened)', ARRAY['Lengthened'], true),
('Biceps Long C-AA Behind-Body Curl (L)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'C-AA', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_long', 'Curl (shoulder extended -- lengthened)', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Curl (shoulder neutral/flexed -- shortened)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Biceps Long BB Drag Curl (S)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'BB', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_long', 'Curl (shoulder neutral/flexed -- shortened)', ARRAY['Shortened'], true),
('Biceps Long C-FT Overhead Curl (S)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'C-FT', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_long', 'Curl (shoulder neutral/flexed -- shortened)', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5.2 Biceps Short Head
-- ---------------------------------------------------------------------------
-- Movement 1: Curl (shoulder flexed -- lengthened)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Biceps Short DB Preacher Curl (L)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'DB', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_short', 'Curl (shoulder flexed -- lengthened)', ARRAY['Lengthened'], true),
('Biceps Short BB Preacher Curl (L)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'BB', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_short', 'Curl (shoulder flexed -- lengthened)', ARRAY['Lengthened'], true),
('Biceps Short M Preacher Curl (L)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'M', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_short', 'Curl (shoulder flexed -- lengthened)', ARRAY['Lengthened'], true),
('Biceps Short C-FT Preacher Curl (L)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'C-FT', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_short', 'Curl (shoulder flexed -- lengthened)', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Curl (shortened)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Biceps Short DB Spider Curl (S)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'DB', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_short', 'Curl (shortened)', ARRAY['Shortened'], true),
('Biceps Short BB Spider Curl (S)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'BB', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_short', 'Curl (shortened)', ARRAY['Shortened'], true),
('Biceps Short DB Concentration Curl (S)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'DB', 'strength', 'elbow_flexors', 'elbow_flexors_biceps_short', 'Curl (shortened)', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5.3 Biceps Omni (Both Heads)
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Biceps Omni BB Standing Curl (M)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'BB', 'strength', 'elbow_flexors', NULL, 'Curl', ARRAY['Mid-range'], true),
('Biceps Omni BB Standing EZ Curl (M)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'BB', 'strength', 'elbow_flexors', NULL, 'Curl', ARRAY['Mid-range'], true),
('Biceps Omni DB Standing Curl (M)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'DB', 'strength', 'elbow_flexors', NULL, 'Curl', ARRAY['Mid-range'], true),
('Biceps Omni C-FT Standing Curl (L)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'C-FT', 'strength', 'elbow_flexors', NULL, 'Curl', ARRAY['Lengthened'], true),
('Biceps Omni C-AA Standing Curl (L)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'C-AA', 'strength', 'elbow_flexors', NULL, 'Curl', ARRAY['Lengthened'], true),
('Biceps Omni M Curl (M)', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'M', 'strength', 'elbow_flexors', NULL, 'Curl', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5.4 Brachialis
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Brachialis DB Standing Hammer Curl (M)', 'Brachialis', ARRAY['Biceps', 'Brachioradialis'], 'DB', 'strength', 'elbow_flexors', 'elbow_flexors_brachialis', 'Hammer / Reverse Curl', ARRAY['Mid-range'], true),
('Brachialis DB Incline Hammer Curl (L)', 'Brachialis', ARRAY['Biceps', 'Brachioradialis'], 'DB', 'strength', 'elbow_flexors', 'elbow_flexors_brachialis', 'Hammer / Reverse Curl', ARRAY['Lengthened'], true),
('Brachialis C-FT Rope Hammer Curl (L)', 'Brachialis', ARRAY['Biceps', 'Brachioradialis'], 'C-FT', 'strength', 'elbow_flexors', 'elbow_flexors_brachialis', 'Hammer / Reverse Curl', ARRAY['Lengthened'], true),
('Brachialis DB Cross-Body Hammer Curl (M)', 'Brachialis', ARRAY['Biceps', 'Brachioradialis'], 'DB', 'strength', 'elbow_flexors', 'elbow_flexors_brachialis', 'Hammer / Reverse Curl', ARRAY['Mid-range'], true),
('Brachialis BB Reverse Curl (M)', 'Brachialis', ARRAY['Brachioradialis', 'Forearms'], 'BB', 'strength', 'elbow_flexors', 'elbow_flexors_brachialis', 'Hammer / Reverse Curl', ARRAY['Mid-range'], true),
('Brachialis C-FT Reverse Curl (L)', 'Brachialis', ARRAY['Brachioradialis', 'Forearms'], 'C-FT', 'strength', 'elbow_flexors', 'elbow_flexors_brachialis', 'Hammer / Reverse Curl', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5.5 Brachioradialis
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Brachioradialis BB Reverse Curl (M)', 'Forearms', ARRAY['Brachialis', 'Forearms'], 'BB', 'strength', 'elbow_flexors', 'elbow_flexors_brachioradialis', 'Reverse Curl', ARRAY['Mid-range'], true),
('Brachioradialis BB Reverse EZ Curl (M)', 'Forearms', ARRAY['Brachialis', 'Forearms'], 'BB', 'strength', 'elbow_flexors', 'elbow_flexors_brachioradialis', 'Reverse Curl', ARRAY['Mid-range'], true),
('Brachioradialis C-FT Reverse Curl (L)', 'Forearms', ARRAY['Brachialis', 'Forearms'], 'C-FT', 'strength', 'elbow_flexors', 'elbow_flexors_brachioradialis', 'Reverse Curl', ARRAY['Lengthened'], true),
('Brachioradialis DB Reverse Curl (M)', 'Forearms', ARRAY['Brachialis', 'Forearms'], 'DB', 'strength', 'elbow_flexors', 'elbow_flexors_brachioradialis', 'Reverse Curl', ARRAY['Mid-range'], true),
('Brachioradialis BB Reverse Preacher Curl (L)', 'Forearms', ARRAY['Brachialis', 'Forearms'], 'BB', 'strength', 'elbow_flexors', 'elbow_flexors_brachioradialis', 'Reverse Curl', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6.1 Triceps Long Head
-- ---------------------------------------------------------------------------
-- Movement 1: Overhead Extension (scapular plane)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Triceps Long DB Single Arm Overhead Extension (L)', 'Triceps', ARRAY[]::text[], 'DB', 'strength', 'triceps', 'triceps_long', 'Overhead Extension (scapular plane)', ARRAY['Lengthened'], true),
('Triceps Long DB Two-Hand Overhead Extension (L)', 'Triceps', ARRAY[]::text[], 'DB', 'strength', 'triceps', 'triceps_long', 'Overhead Extension (scapular plane)', ARRAY['Lengthened'], true),
('Triceps Long C-FT Rope Overhead Extension (L)', 'Triceps', ARRAY[]::text[], 'C-FT', 'strength', 'triceps', 'triceps_long', 'Overhead Extension (scapular plane)', ARRAY['Lengthened'], true),
('Triceps Long C-AA Overhead Extension (L)', 'Triceps', ARRAY[]::text[], 'C-AA', 'strength', 'triceps', 'triceps_long', 'Overhead Extension (scapular plane)', ARRAY['Lengthened'], true),
('Triceps Long BB Overhead EZ Extension (L)', 'Triceps', ARRAY[]::text[], 'BB', 'strength', 'triceps', 'triceps_long', 'Overhead Extension (scapular plane)', ARRAY['Lengthened'], true),
('Triceps Long M Overhead Extension (L)', 'Triceps', ARRAY[]::text[], 'M', 'strength', 'triceps', 'triceps_long', 'Overhead Extension (scapular plane)', ARRAY['Lengthened'], true),
('Triceps Long C-FT Cross-Body Overhead Extension (L)', 'Triceps', ARRAY[]::text[], 'C-FT', 'strength', 'triceps', 'triceps_long', 'Overhead Extension (scapular plane)', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Extension with Shoulder Extension (scapular aligned)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Triceps Long C-FT Kickback (S)', 'Triceps', ARRAY[]::text[], 'C-FT', 'strength', 'triceps', 'triceps_long', 'Extension with Shoulder Extension (scapular aligned)', ARRAY['Shortened'], true),
('Triceps Long DB Kickback (S)', 'Triceps', ARRAY[]::text[], 'DB', 'strength', 'triceps', 'triceps_long', 'Extension with Shoulder Extension (scapular aligned)', ARRAY['Shortened'], true),
('Triceps Long C-FT Scapular Extension (S)', 'Triceps', ARRAY[]::text[], 'C-FT', 'strength', 'triceps', 'triceps_long', 'Extension with Shoulder Extension (scapular aligned)', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6.2 Lateral + Medial Heads
-- ---------------------------------------------------------------------------
-- Movement 1: Pushdown / Pressdown
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Triceps Lat+Med C-FT Straight Bar Pushdown (S)', 'Triceps', ARRAY[]::text[], 'C-FT', 'strength', 'triceps', 'triceps_lateral', 'Pushdown / Pressdown', ARRAY['Shortened'], true),
('Triceps Lat+Med C-FT V-Bar Pushdown (S)', 'Triceps', ARRAY[]::text[], 'C-FT', 'strength', 'triceps', 'triceps_lateral', 'Pushdown / Pressdown', ARRAY['Shortened'], true),
('Triceps Lat+Med C-FT Rope Pushdown (S)', 'Triceps', ARRAY[]::text[], 'C-FT', 'strength', 'triceps', 'triceps_lateral', 'Pushdown / Pressdown', ARRAY['Shortened'], true),
('Triceps Lat+Med C-AA Pushdown (S)', 'Triceps', ARRAY[]::text[], 'C-AA', 'strength', 'triceps', 'triceps_lateral', 'Pushdown / Pressdown', ARRAY['Shortened'], true),
('Triceps Lat+Med C-FT Reverse Grip Pushdown (S)', 'Triceps', ARRAY[]::text[], 'C-FT', 'strength', 'triceps', 'triceps_lateral', 'Pushdown / Pressdown', ARRAY['Shortened'], true),
('Triceps Lat+Med M Pressdown (S)', 'Triceps', ARRAY[]::text[], 'M', 'strength', 'triceps', 'triceps_lateral', 'Pushdown / Pressdown', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Extension / Press (non-scapular)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Triceps Lat+Med BB Lying Skull Crusher (L)', 'Triceps', ARRAY[]::text[], 'BB', 'strength', 'triceps', 'triceps_lateral', 'Extension / Press (non-scapular)', ARRAY['Lengthened'], true),
('Triceps Lat+Med DB Lying Skull Crusher (L)', 'Triceps', ARRAY[]::text[], 'DB', 'strength', 'triceps', 'triceps_lateral', 'Extension / Press (non-scapular)', ARRAY['Lengthened'], true),
('Triceps Lat+Med C-FT Lying Skull Crusher (L)', 'Triceps', ARRAY[]::text[], 'C-FT', 'strength', 'triceps', 'triceps_lateral', 'Extension / Press (non-scapular)', ARRAY['Lengthened'], true),
('Triceps Lat+Med BB Close-Grip Press (M)', 'Triceps', ARRAY['Chest', 'Front Delts'], 'BB', 'strength', 'triceps', 'triceps_lateral', 'Extension / Press (non-scapular)', ARRAY['Mid-range'], true),
('Triceps Lat+Med BW Upright Dip (M)', 'Triceps', ARRAY['Chest', 'Front Delts'], 'BW', 'strength', 'triceps', 'triceps_lateral', 'Extension / Press (non-scapular)', ARRAY['Mid-range'], true),
('Triceps Lat+Med M Dip (M)', 'Triceps', ARRAY['Chest', 'Front Delts'], 'M', 'strength', 'triceps', 'triceps_lateral', 'Extension / Press (non-scapular)', ARRAY['Mid-range'], true),
('Triceps Lat+Med BW Diamond Push-Up (M)', 'Triceps', ARRAY['Chest', 'Front Delts'], 'BW', 'strength', 'triceps', 'triceps_lateral', 'Extension / Press (non-scapular)', ARRAY['Mid-range'], true),
('Triceps Lat+Med BB JM Press (M)', 'Triceps', ARRAY['Chest', 'Front Delts'], 'BB', 'strength', 'triceps', 'triceps_lateral', 'Extension / Press (non-scapular)', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7.1 Wrist Flexors
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Forearm Flexors BB Seated Wrist Curl (S)', 'Forearms', ARRAY[]::text[], 'BB', 'strength', 'forearm', 'forearm_flexors', 'Wrist Curl', ARRAY['Shortened'], true),
('Forearm Flexors DB Seated Wrist Curl (S)', 'Forearms', ARRAY[]::text[], 'DB', 'strength', 'forearm', 'forearm_flexors', 'Wrist Curl', ARRAY['Shortened'], true),
('Forearm Flexors BB Behind-Back Wrist Curl (S)', 'Forearms', ARRAY[]::text[], 'BB', 'strength', 'forearm', 'forearm_flexors', 'Wrist Curl', ARRAY['Shortened'], true),
('Forearm Flexors C-FT Wrist Curl (S)', 'Forearms', ARRAY[]::text[], 'C-FT', 'strength', 'forearm', 'forearm_flexors', 'Wrist Curl', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7.2 Wrist Extensors
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Forearm Extensors BB Seated Reverse Wrist Curl (S)', 'Forearms', ARRAY[]::text[], 'BB', 'strength', 'forearm', 'forearm_extensors', 'Reverse Wrist Curl', ARRAY['Shortened'], true),
('Forearm Extensors DB Seated Reverse Wrist Curl (S)', 'Forearms', ARRAY[]::text[], 'DB', 'strength', 'forearm', 'forearm_extensors', 'Reverse Wrist Curl', ARRAY['Shortened'], true),
('Forearm Extensors C-FT Reverse Wrist Curl (S)', 'Forearms', ARRAY[]::text[], 'C-FT', 'strength', 'forearm', 'forearm_extensors', 'Reverse Wrist Curl', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7.3 Pronators
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Forearm Pronators DB Seated Pronation (M)', 'Forearms', ARRAY['Wrist Flexors'], 'DB', 'strength', 'forearm', 'forearm_pronators', 'Pronation', ARRAY['Mid-range'], true),
('Forearm Pronators C-FT Pronation (M)', 'Forearms', ARRAY['Wrist Flexors'], 'C-FT', 'strength', 'forearm', 'forearm_pronators', 'Pronation', ARRAY['Mid-range'], true),
('Forearm Pronators BW Band Pronation (S)', 'Forearms', ARRAY['Wrist Flexors'], 'BW', 'strength', 'forearm', 'forearm_pronators', 'Pronation', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7.4 Supinators
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Forearm Supinators DB Seated Supination (M)', 'Forearms', ARRAY['Biceps'], 'DB', 'strength', 'forearm', 'forearm_supinators', 'Supination', ARRAY['Mid-range'], true),
('Forearm Supinators C-FT Supination (M)', 'Forearms', ARRAY['Biceps'], 'C-FT', 'strength', 'forearm', 'forearm_supinators', 'Supination', ARRAY['Mid-range'], true),
('Forearm Supinators BW Band Supination (S)', 'Forearms', ARRAY['Biceps'], 'BW', 'strength', 'forearm', 'forearm_supinators', 'Supination', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8.1 Upper Trapezius
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Upper Traps BB Shrug (S)', 'Traps', ARRAY['Levator Scapulae'], 'BB', 'strength', 'upper_mid_back', 'upper_back_upper_traps', 'Shrug', ARRAY['Shortened'], true),
('Upper Traps DB Shrug (S)', 'Traps', ARRAY['Levator Scapulae'], 'DB', 'strength', 'upper_mid_back', 'upper_back_upper_traps', 'Shrug', ARRAY['Shortened'], true),
('Upper Traps M Smith Shrug (S)', 'Traps', ARRAY['Levator Scapulae'], 'M', 'strength', 'upper_mid_back', 'upper_back_upper_traps', 'Shrug', ARRAY['Shortened'], true),
('Upper Traps M Shrug (S)', 'Traps', ARRAY['Levator Scapulae'], 'M', 'strength', 'upper_mid_back', 'upper_back_upper_traps', 'Shrug', ARRAY['Shortened'], true),
('Upper Traps C-FT Shrug (S)', 'Traps', ARRAY['Levator Scapulae'], 'C-FT', 'strength', 'upper_mid_back', 'upper_back_upper_traps', 'Shrug', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8.2 Middle Trapezius
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Mid Traps C-FT Rope Face Pull (S)', 'Upper Back', ARRAY['Rear Delts', 'Rhomboids'], 'C-FT', 'strength', 'upper_mid_back', 'mid_back_mid_traps', 'Retraction Row / Face Pull', ARRAY['Shortened'], true),
('Mid Traps C-AA Face Pull (S)', 'Upper Back', ARRAY['Rear Delts', 'Rhomboids'], 'C-AA', 'strength', 'upper_mid_back', 'mid_back_mid_traps', 'Retraction Row / Face Pull', ARRAY['Shortened'], true),
('Mid Traps DB Chest-Supported Wide Row (S)', 'Upper Back', ARRAY['Rear Delts', 'Rhomboids'], 'DB', 'strength', 'upper_mid_back', 'mid_back_mid_traps', 'Retraction Row / Face Pull', ARRAY['Shortened'], true),
('Mid Traps DB Prone Y-Raise (S)', 'Upper Back', ARRAY['Lower Traps', 'Rear Delts'], 'DB', 'strength', 'upper_mid_back', 'mid_back_mid_traps', 'Retraction Row / Face Pull', ARRAY['Shortened'], true),
('Mid Traps C-FT Rear Delt Row (M)', 'Upper Back', ARRAY['Rear Delts', 'Rhomboids'], 'C-FT', 'strength', 'upper_mid_back', 'mid_back_mid_traps', 'Retraction Row / Face Pull', ARRAY['Mid-range'], true),
('Mid Traps C-AA Rear Delt Row (M)', 'Upper Back', ARRAY['Rear Delts', 'Rhomboids'], 'C-AA', 'strength', 'upper_mid_back', 'mid_back_mid_traps', 'Retraction Row / Face Pull', ARRAY['Mid-range'], true),
('Mid Traps DB Bent Over Rear Delt Row (M)', 'Upper Back', ARRAY['Rear Delts', 'Rhomboids'], 'DB', 'strength', 'upper_mid_back', 'mid_back_mid_traps', 'Retraction Row / Face Pull', ARRAY['Mid-range'], true),
('Mid Traps M Rear Delt Row (S)', 'Upper Back', ARRAY['Rear Delts', 'Rhomboids'], 'M', 'strength', 'upper_mid_back', 'mid_back_mid_traps', 'Retraction Row / Face Pull', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8.3 Lower Trapezius
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Lower Traps DB Prone Y-Raise (S)', 'Upper Back', ARRAY['Mid Traps', 'Rear Delts'], 'DB', 'strength', 'upper_mid_back', 'mid_back_low_traps', 'Scapular Depression', ARRAY['Shortened'], true),
('Lower Traps C-FT Y-Pull-Down (S)', 'Upper Back', ARRAY['Mid Traps'], 'C-FT', 'strength', 'upper_mid_back', 'mid_back_low_traps', 'Scapular Depression', ARRAY['Shortened'], true),
('Lower Traps C-AA Y-Pull-Down (S)', 'Upper Back', ARRAY['Mid Traps'], 'C-AA', 'strength', 'upper_mid_back', 'mid_back_low_traps', 'Scapular Depression', ARRAY['Shortened'], true),
('Lower Traps BW Band Pull-Apart Angled (S)', 'Upper Back', ARRAY['Mid Traps', 'Rear Delts'], 'BW', 'strength', 'upper_mid_back', 'mid_back_low_traps', 'Scapular Depression', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8.4 Rhomboids
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Rhomboids C-FT Close Grip Seated Row (S)', 'Upper Back', ARRAY['Mid Traps', 'Biceps'], 'C-FT', 'strength', 'upper_mid_back', 'mid_back_rhomboids', 'Row (retraction emphasis)', ARRAY['Shortened'], true),
('Rhomboids C-FS Close Grip Seated Row (S)', 'Upper Back', ARRAY['Mid Traps', 'Biceps'], 'C-FS', 'strength', 'upper_mid_back', 'mid_back_rhomboids', 'Row (retraction emphasis)', ARRAY['Shortened'], true),
('Rhomboids DB Chest-Supported Close Row (S)', 'Upper Back', ARRAY['Mid Traps', 'Biceps'], 'DB', 'strength', 'upper_mid_back', 'mid_back_rhomboids', 'Row (retraction emphasis)', ARRAY['Shortened'], true),
('Rhomboids M Close Grip Chest-Supported Row (S)', 'Upper Back', ARRAY['Mid Traps', 'Biceps'], 'M', 'strength', 'upper_mid_back', 'mid_back_rhomboids', 'Row (retraction emphasis)', ARRAY['Shortened'], true),
('Rhomboids BW Band Row (S)', 'Upper Back', ARRAY['Mid Traps', 'Rear Delts'], 'BW', 'strength', 'upper_mid_back', 'mid_back_rhomboids', 'Row (retraction emphasis)', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8.5 Teres Major
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Teres Major M Close Grip Pronated Pulldown (L)', 'Upper Back', ARRAY['Lats', 'Biceps'], 'M', 'strength', 'upper_mid_back', 'upper_back_teres_major', 'Pulldown / Row (internal rotation emphasis)', ARRAY['Lengthened'], true),
('Teres Major C-FT Straight Arm Pulldown (L)', 'Upper Back', ARRAY['Lats'], 'C-FT', 'strength', 'upper_mid_back', 'upper_back_teres_major', 'Pulldown / Row (internal rotation emphasis)', ARRAY['Lengthened'], true),
('Teres Major C-FT Neutral Grip Elbows-Tight Row (M)', 'Upper Back', ARRAY['Lats', 'Biceps', 'Rhomboids'], 'C-FT', 'strength', 'upper_mid_back', 'upper_back_teres_major', 'Pulldown / Row (internal rotation emphasis)', ARRAY['Mid-range'], true),
('Teres Major DB Narrow Pullover (L)', 'Upper Back', ARRAY['Lats', 'Chest'], 'DB', 'strength', 'upper_mid_back', 'upper_back_teres_major', 'Pulldown / Row (internal rotation emphasis)', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9.1 Thoracic Lats (Upper)
-- ---------------------------------------------------------------------------
-- Movement 1: Pulldown (wide/overhand)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Thoracic Lat M Wide Grip Pulldown (L)', 'Lats', ARRAY['Biceps', 'Rear Delts', 'Rhomboids'], 'M', 'strength', 'lats', 'lats_thoracic', 'Pulldown (wide/overhand)', ARRAY['Lengthened'], true),
('Thoracic Lat C-FT Wide Bar Pulldown (L)', 'Lats', ARRAY['Biceps', 'Rear Delts', 'Rhomboids'], 'C-FT', 'strength', 'lats', 'lats_thoracic', 'Pulldown (wide/overhand)', ARRAY['Lengthened'], true),
('Thoracic Lat BW Wide Grip Pull-Up (L)', 'Lats', ARRAY['Biceps', 'Rear Delts', 'Rhomboids'], 'BW', 'strength', 'lats', 'lats_thoracic', 'Pulldown (wide/overhand)', ARRAY['Lengthened'], true),
('Thoracic Lat M Assisted Pull-Up (L)', 'Lats', ARRAY['Biceps', 'Rear Delts', 'Rhomboids'], 'M', 'strength', 'lats', 'lats_thoracic', 'Pulldown (wide/overhand)', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Row
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Thoracic Lat BB Wide Overhand Row (M)', 'Lats', ARRAY['Rear Delts', 'Biceps', 'Rhomboids'], 'BB', 'strength', 'lats', 'lats_thoracic', 'Row', ARRAY['Mid-range'], true),
('Thoracic Lat DB Single Arm Row (M)', 'Lats', ARRAY['Rear Delts', 'Biceps', 'Rhomboids'], 'DB', 'strength', 'lats', 'lats_thoracic', 'Row', ARRAY['Mid-range'], true),
('Thoracic Lat BB T-Bar Row (M)', 'Lats', ARRAY['Rear Delts', 'Biceps', 'Rhomboids'], 'BB', 'strength', 'lats', 'lats_thoracic', 'Row', ARRAY['Mid-range'], true),
('Thoracic Lat C-FT Wide Grip Seated Row (M)', 'Lats', ARRAY['Rear Delts', 'Biceps', 'Rhomboids'], 'C-FT', 'strength', 'lats', 'lats_thoracic', 'Row', ARRAY['Mid-range'], true),
('Thoracic Lat M Wide Grip Chest-Supported Row (M)', 'Lats', ARRAY['Rear Delts', 'Biceps', 'Rhomboids'], 'M', 'strength', 'lats', 'lats_thoracic', 'Row', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 3: Pull Around
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Thoracic Lat C-FT Single Arm Pull Around (M)', 'Lats', ARRAY['Teres Major', 'Rear Delts'], 'C-FT', 'strength', 'lats', 'lats_thoracic', 'Pull Around', ARRAY['Mid-range'], true),
('Thoracic Lat C-AA Single Arm Pull Around (M)', 'Lats', ARRAY['Teres Major', 'Rear Delts'], 'C-AA', 'strength', 'lats', 'lats_thoracic', 'Pull Around', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9.2 Lumbar Lats (Mid)
-- ---------------------------------------------------------------------------
-- Movement 1: Row (narrow)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Lumbar Lat C-FT Narrow Grip Seated Row (M)', 'Lats', ARRAY['Biceps', 'Mid Traps'], 'C-FT', 'strength', 'lats', 'lats_lumbar', 'Row (narrow)', ARRAY['Mid-range'], true),
('Lumbar Lat C-FS Narrow Grip Seated Row (M)', 'Lats', ARRAY['Biceps', 'Mid Traps'], 'C-FS', 'strength', 'lats', 'lats_lumbar', 'Row (narrow)', ARRAY['Mid-range'], true),
('Lumbar Lat DB Single Arm Elbows-Tight Row (M)', 'Lats', ARRAY['Biceps', 'Rhomboids'], 'DB', 'strength', 'lats', 'lats_lumbar', 'Row (narrow)', ARRAY['Mid-range'], true),
('Lumbar Lat M Narrow Grip Row (M)', 'Lats', ARRAY['Biceps', 'Mid Traps'], 'M', 'strength', 'lats', 'lats_lumbar', 'Row (narrow)', ARRAY['Mid-range'], true),
('Lumbar Lat BB Narrow Underhand Row (M)', 'Lats', ARRAY['Biceps', 'Mid Traps'], 'BB', 'strength', 'lats', 'lats_lumbar', 'Row (narrow)', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Pull Around
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Lumbar Lat C-FT Single Arm High Pull Around (M)', 'Lats', ARRAY['Teres Major', 'Rear Delts'], 'C-FT', 'strength', 'lats', 'lats_lumbar', 'Pull Around', ARRAY['Mid-range'], true),
('Lumbar Lat C-AA Single Arm Pull Around (M)', 'Lats', ARRAY['Teres Major', 'Rear Delts'], 'C-AA', 'strength', 'lats', 'lats_lumbar', 'Pull Around', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9.3 Iliac Lats (Lower)
-- ---------------------------------------------------------------------------
-- Movement 1: Pulldown (close/underhand)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Iliac Lat M Close Underhand Pulldown (L)', 'Lats', ARRAY['Biceps', 'Lower Traps'], 'M', 'strength', 'lats', 'lats_iliac', 'Pulldown (close/underhand)', ARRAY['Lengthened'], true),
('Iliac Lat C-FT Close Grip V-Bar Pulldown (L)', 'Lats', ARRAY['Biceps', 'Lower Traps'], 'C-FT', 'strength', 'lats', 'lats_iliac', 'Pulldown (close/underhand)', ARRAY['Lengthened'], true),
('Iliac Lat BW Underhand Chin-Up (L)', 'Lats', ARRAY['Biceps', 'Lower Traps'], 'BW', 'strength', 'lats', 'lats_iliac', 'Pulldown (close/underhand)', ARRAY['Lengthened'], true),
('Iliac Lat M Assisted Chin-Up (L)', 'Lats', ARRAY['Biceps', 'Lower Traps'], 'M', 'strength', 'lats', 'lats_iliac', 'Pulldown (close/underhand)', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Pull Around
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Iliac Lat C-FT Single Arm Straight Arm Pull Around (L)', 'Lats', ARRAY['Teres Major', 'Triceps (long head)'], 'C-FT', 'strength', 'lats', 'lats_iliac', 'Pull Around', ARRAY['Lengthened'], true),
('Iliac Lat C-AA Single Arm Vertical Pull Around (L)', 'Lats', ARRAY['Teres Major', 'Triceps (long head)'], 'C-AA', 'strength', 'lats', 'lats_iliac', 'Pull Around', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 3: Straight-Arm Pulldown / Pullover
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Iliac Lat C-FT Straight Arm Pulldown (L)', 'Lats', ARRAY['Teres Major', 'Triceps (long head)'], 'C-FT', 'strength', 'lats', 'lats_iliac', 'Straight-Arm Pulldown / Pullover', ARRAY['Lengthened'], true),
('Iliac Lat C-AA Straight Arm Pulldown (L)', 'Lats', ARRAY['Teres Major', 'Triceps (long head)'], 'C-AA', 'strength', 'lats', 'lats_iliac', 'Straight-Arm Pulldown / Pullover', ARRAY['Lengthened'], true),
('Iliac Lat DB Pullover (L)', 'Lats', ARRAY['Chest', 'Triceps (long head)'], 'DB', 'strength', 'lats', 'lats_iliac', 'Straight-Arm Pulldown / Pullover', ARRAY['Lengthened'], true),
('Iliac Lat M Pullover (L)', 'Lats', ARRAY['Teres Major', 'Chest'], 'M', 'strength', 'lats', 'lats_iliac', 'Straight-Arm Pulldown / Pullover', ARRAY['Lengthened'], true),
('Iliac Lat C-FT Lat Prayer (S)', 'Lats', ARRAY['Teres Major', 'Core'], 'C-FT', 'strength', 'lats', 'lats_iliac', 'Straight-Arm Pulldown / Pullover', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10.1 Abs (Rectus Abdominis, Obliques, TVA)
-- ---------------------------------------------------------------------------
-- Movement 1: Spinal Flexion
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Abs C-FT Kneeling Cable Crunch (S)', 'Core', ARRAY['Obliques'], 'C-FT', 'strength', 'core', 'core_rectus_abdominis', 'Spinal Flexion', ARRAY['Shortened'], true),
('Abs C-AA Kneeling Cable Crunch (S)', 'Core', ARRAY['Obliques'], 'C-AA', 'strength', 'core', 'core_rectus_abdominis', 'Spinal Flexion', ARRAY['Shortened'], true),
('Abs M Crunch (S)', 'Core', ARRAY['Obliques'], 'M', 'strength', 'core', 'core_rectus_abdominis', 'Spinal Flexion', ARRAY['Shortened'], true),
('Abs DB Weighted Crunch (S)', 'Core', ARRAY['Obliques'], 'DB', 'strength', 'core', 'core_rectus_abdominis', 'Spinal Flexion', ARRAY['Shortened'], true),
('Abs BW Swiss Ball Crunch (L)', 'Core', ARRAY['Obliques'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Spinal Flexion', ARRAY['Lengthened'], true),
('Abs BW Hanging Leg Raise (L)', 'Core', ARRAY['Hip Flexors', 'Obliques'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Spinal Flexion', ARRAY['Lengthened'], true),
('Abs BW Captain''s Chair Leg Raise (L)', 'Core', ARRAY['Hip Flexors', 'Obliques'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Spinal Flexion', ARRAY['Lengthened'], true),
('Abs BW Lying Leg Raise (L)', 'Core', ARRAY['Hip Flexors'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Spinal Flexion', ARRAY['Lengthened'], true),
('Abs BW Reverse Crunch (S)', 'Core', ARRAY['Hip Flexors'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Spinal Flexion', ARRAY['Shortened'], true),
('Abs C-FT Reverse Crunch (S)', 'Core', ARRAY['Hip Flexors'], 'C-FT', 'strength', 'core', 'core_rectus_abdominis', 'Spinal Flexion', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Anti-Extension
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Abs BW Front Plank (M)', 'Core', ARRAY['Obliques', 'Erector Spinae'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Anti-Extension', ARRAY['Mid-range'], true),
('Abs BW Ab Wheel Rollout (L)', 'Core', ARRAY['Lats', 'Obliques'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Anti-Extension', ARRAY['Lengthened'], true),
('Abs BW Dead Bug (M)', 'Core', ARRAY['Hip Flexors', 'Obliques'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Anti-Extension', ARRAY['Mid-range'], true),
('Abs BW Bird Dog (M)', 'Core', ARRAY['Erector Spinae', 'Glutes'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Anti-Extension', ARRAY['Mid-range'], true),
('Abs BW Bear Plank (M)', 'Core', ARRAY['Obliques', 'Hip Flexors'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Anti-Extension', ARRAY['Mid-range'], true),
('Abs DB Farmer''s Walk (M)', 'Core', ARRAY['Obliques', 'Forearms', 'Traps'], 'DB', 'strength', 'core', 'core_rectus_abdominis', 'Anti-Extension', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 3: Rotation
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Abs C-FT High-to-Low Woodchop (M)', 'Core', ARRAY['Obliques', 'Shoulders'], 'C-FT', 'strength', 'core', 'core_rectus_abdominis', 'Rotation', ARRAY['Mid-range'], true),
('Abs C-FT Low-to-High Woodchop (M)', 'Core', ARRAY['Obliques', 'Shoulders'], 'C-FT', 'strength', 'core', 'core_rectus_abdominis', 'Rotation', ARRAY['Mid-range'], true),
('Abs C-AA Woodchop (M)', 'Core', ARRAY['Obliques', 'Shoulders'], 'C-AA', 'strength', 'core', 'core_rectus_abdominis', 'Rotation', ARRAY['Mid-range'], true),
('Abs DB Russian Twist (M)', 'Core', ARRAY['Obliques'], 'DB', 'strength', 'core', 'core_rectus_abdominis', 'Rotation', ARRAY['Mid-range'], true),
('Abs BB Landmine Rotation (M)', 'Core', ARRAY['Obliques', 'Shoulders'], 'BB', 'strength', 'core', 'core_rectus_abdominis', 'Rotation', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 4: Anti-Rotation
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Abs C-FT Pallof Press (S)', 'Core', ARRAY['Obliques'], 'C-FT', 'strength', 'core', 'core_rectus_abdominis', 'Anti-Rotation', ARRAY['Shortened'], true),
('Abs C-AA Pallof Press (S)', 'Core', ARRAY['Obliques'], 'C-AA', 'strength', 'core', 'core_rectus_abdominis', 'Anti-Rotation', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 5: Lateral Flexion
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Abs DB Side Bend (S)', 'Core', ARRAY['Obliques'], 'DB', 'strength', 'core', 'core_rectus_abdominis', 'Lateral Flexion', ARRAY['Shortened'], true),
('Abs C-FT Side Bend (S)', 'Core', ARRAY['Obliques'], 'C-FT', 'strength', 'core', 'core_rectus_abdominis', 'Lateral Flexion', ARRAY['Shortened'], true),
('Abs BW 45 Degree Lateral Flexion (M)', 'Core', ARRAY['Obliques', 'Erector Spinae'], 'BW / M', 'strength', 'core', 'core_rectus_abdominis', 'Lateral Flexion', ARRAY['Mid-range'], true),
('Abs BW Hanging Oblique Raise (L)', 'Core', ARRAY['Hip Flexors', 'Obliques'], 'BW', 'strength', 'core', 'core_rectus_abdominis', 'Lateral Flexion', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 10.2 Spinal Extensors (Erector Spinae)
-- ---------------------------------------------------------------------------
-- Movement 1: Spinal Extension
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Spinal Extensors BW 45 Degree Back Extension (L)', 'Core', ARRAY['Glutes', 'Hamstrings'], 'BW', 'strength', 'core', 'core_erectors', 'Spinal Extension', ARRAY['Lengthened'], true),
('Spinal Extensors M Back Extension (L)', 'Core', ARRAY['Glutes', 'Hamstrings'], 'M', 'strength', 'core', 'core_erectors', 'Spinal Extension', ARRAY['Lengthened'], true),
('Spinal Extensors M Reverse Hyper (L)', 'Core', ARRAY['Glutes', 'Hamstrings'], 'M', 'strength', 'core', 'core_erectors', 'Spinal Extension', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Anti-Flexion
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Spinal Extensors BB Good Morning (L)', 'Core', ARRAY['Hamstrings', 'Glutes'], 'BB', 'strength', 'core', 'core_erectors', 'Anti-Flexion', ARRAY['Lengthened'], true),
('Spinal Extensors BB Seated Good Morning (L)', 'Core', ARRAY['Hamstrings'], 'BB', 'strength', 'core', 'core_erectors', 'Anti-Flexion', ARRAY['Lengthened'], true),
('Spinal Extensors DB Farmer''s Walk (M)', 'Core', ARRAY['Forearms', 'Traps', 'Core'], 'DB', 'strength', 'core', 'core_erectors', 'Anti-Flexion', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- 10.3 Pelvic Floor — placeholder, no exercises

-- ---------------------------------------------------------------------------
-- 11.1 Gluteus Maximus
-- ---------------------------------------------------------------------------
-- Movement 1: Hip Hinge
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Glute Max BB Romanian Deadlift (L)', 'Glutes', ARRAY['Hamstrings', 'Erector Spinae'], 'BB', 'strength', 'glutes', 'glutes_max', 'Hip Hinge', ARRAY['Lengthened'], true),
('Glute Max DB Romanian Deadlift (L)', 'Glutes', ARRAY['Hamstrings', 'Erector Spinae'], 'DB', 'strength', 'glutes', 'glutes_max', 'Hip Hinge', ARRAY['Lengthened'], true),
('Glute Max BB Conventional Deadlift (M)', 'Glutes', ARRAY['Hamstrings', 'Erector Spinae', 'Quads'], 'BB', 'strength', 'glutes', 'glutes_max', 'Hip Hinge', ARRAY['Mid-range'], true),
('Glute Max BB Sumo Deadlift (M)', 'Glutes', ARRAY['Adductors', 'Hamstrings', 'Quads'], 'BB', 'strength', 'glutes', 'glutes_max', 'Hip Hinge', ARRAY['Mid-range'], true),
('Glute Max C-FT Pull-Through (L)', 'Glutes', ARRAY['Hamstrings'], 'C-FT', 'strength', 'glutes', 'glutes_max', 'Hip Hinge', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Thrust / Bridge
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Glute Max BB Bench Hip Thrust (S)', 'Glutes', ARRAY['Hamstrings'], 'BB', 'strength', 'glutes', 'glutes_max', 'Thrust / Bridge', ARRAY['Shortened'], true),
('Glute Max M Hip Thrust (S)', 'Glutes', ARRAY['Hamstrings'], 'M', 'strength', 'glutes', 'glutes_max', 'Thrust / Bridge', ARRAY['Shortened'], true),
('Glute Max DB Hip Thrust (S)', 'Glutes', ARRAY['Hamstrings'], 'DB', 'strength', 'glutes', 'glutes_max', 'Thrust / Bridge', ARRAY['Shortened'], true),
('Glute Max BB Glute Bridge (S)', 'Glutes', ARRAY['Hamstrings'], 'BB', 'strength', 'glutes', 'glutes_max', 'Thrust / Bridge', ARRAY['Shortened'], true),
('Glute Max BW Single-Leg Hip Thrust (S)', 'Glutes', ARRAY['Hamstrings', 'Core'], 'BW', 'strength', 'glutes', 'glutes_max', 'Thrust / Bridge', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 3: Squat / Press (glute emphasis)
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Glute Max BB Low Bar Wide Squat (M)', 'Glutes', ARRAY['Quads', 'Adductors', 'Core'], 'BB', 'strength', 'glutes', 'glutes_max', 'Squat / Press (glute emphasis)', ARRAY['Mid-range'], true),
('Glute Max BB Front Squat (M)', 'Glutes', ARRAY['Quads', 'Core'], 'BB', 'strength', 'glutes', 'glutes_max', 'Squat / Press (glute emphasis)', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 11.2 Gluteus Medius / Minimus
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Glute Med M Seated Hip Abduction (S)', 'Glutes', ARRAY['TFL'], 'M', 'strength', 'glutes', 'glutes_med', 'Abduction', ARRAY['Shortened'], true),
('Glute Med C-FT Hip Abduction (L)', 'Glutes', ARRAY['TFL'], 'C-FT', 'strength', 'glutes', 'glutes_med', 'Abduction', ARRAY['Lengthened'], true),
('Glute Med C-AA Hip Abduction (L)', 'Glutes', ARRAY['TFL'], 'C-AA', 'strength', 'glutes', 'glutes_med', 'Abduction', ARRAY['Lengthened'], true),
('Glute Med BW Side-Lying Clamshell (S)', 'Glutes', ARRAY['TFL'], 'BW', 'strength', 'glutes', 'glutes_med', 'Abduction', ARRAY['Shortened'], true),
('Glute Med BW Band Lateral Walk (S)', 'Glutes', ARRAY['TFL'], 'BW', 'strength', 'glutes', 'glutes_med', 'Abduction', ARRAY['Shortened'], true),
('Glute Med DB Side-Lying Abduction (S)', 'Glutes', ARRAY['TFL'], 'DB', 'strength', 'glutes', 'glutes_med', 'Abduction', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 12.1 Hip Flexors (Iliopsoas)
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Hip Flexors BW Hanging Knee Raise (L)', 'Hip Flexors', ARRAY['Lower Abs'], 'BW', 'strength', 'hip_flexors', NULL, 'Hip Flexion', ARRAY['Lengthened'], true),
('Hip Flexors C-FT Hip Flexion (L)', 'Hip Flexors', ARRAY['Lower Abs'], 'C-FT', 'strength', 'hip_flexors', NULL, 'Hip Flexion', ARRAY['Lengthened'], true),
('Hip Flexors M Hip Flexion (M)', 'Hip Flexors', ARRAY['Lower Abs'], 'M', 'strength', 'hip_flexors', NULL, 'Hip Flexion', ARRAY['Mid-range'], true),
('Hip Flexors BW Lying Leg Raise (L)', 'Hip Flexors', ARRAY['Lower Abs'], 'BW', 'strength', 'hip_flexors', NULL, 'Hip Flexion', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 13.1 Adductors
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Adductors M Seated Adduction (S)', 'Adductors', ARRAY[]::text[], 'M', 'strength', 'adductors', NULL, 'Adduction', ARRAY['Shortened'], true),
('Adductors C-FT Adduction (L)', 'Adductors', ARRAY[]::text[], 'C-FT', 'strength', 'adductors', NULL, 'Adduction', ARRAY['Lengthened'], true),
('Adductors C-AA Adduction (L)', 'Adductors', ARRAY[]::text[], 'C-AA', 'strength', 'adductors', NULL, 'Adduction', ARRAY['Lengthened'], true),
('Adductors BW Copenhagen Plank (M)', 'Adductors', ARRAY['Core', 'Obliques'], 'BW', 'strength', 'adductors', NULL, 'Adduction', ARRAY['Mid-range'], true),
('Adductors DB Wide Stance Goblet Squat (L)', 'Adductors', ARRAY['Quads', 'Glutes'], 'DB', 'strength', 'adductors', NULL, 'Adduction', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 14.1 Abductors (TFL)
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Abductors M Seated IR Abduction (S)', 'Abductors', ARRAY['Glute Medius'], 'M', 'strength', 'abductors', NULL, 'Internal-Rotation-Biased Abduction', ARRAY['Shortened'], true),
('Abductors C-FT IR Abduction (L)', 'Abductors', ARRAY['Glute Medius'], 'C-FT', 'strength', 'abductors', NULL, 'Internal-Rotation-Biased Abduction', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 15.1 Rectus Femoris
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Quads M Seated Leg Extension (S)', 'Quadriceps', ARRAY['Vastus Group'], 'M', 'strength', 'quads', 'quads_rectus_femoris', 'Knee Extension (hip neutral/extended)', ARRAY['Shortened'], true),
('Quads C-FT Standing Leg Extension (S)', 'Quadriceps', ARRAY['Vastus Group'], 'C-FT', 'strength', 'quads', 'quads_rectus_femoris', 'Knee Extension (hip neutral/extended)', ARRAY['Shortened'], true),
('Quads BW Sissy Squat (L)', 'Quadriceps', ARRAY['Vastus Group', 'Core'], 'BW / M', 'strength', 'quads', 'quads_rectus_femoris', 'Knee Extension (hip neutral/extended)', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 15.2 Vastus Group
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Quads BB High Bar Back Squat (M)', 'Quadriceps', ARRAY['Glutes', 'Adductors', 'Core'], 'BB', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads BB Front Squat (M)', 'Quadriceps', ARRAY['Glutes', 'Core'], 'BB', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads M Smith Squat (M)', 'Quadriceps', ARRAY['Glutes'], 'M', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads M Hack Squat (M)', 'Quadriceps', ARRAY['Glutes'], 'M', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads DB Goblet Squat (M)', 'Quadriceps', ARRAY['Glutes', 'Core'], 'DB', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads DB Bulgarian Split Squat (L)', 'Quadriceps', ARRAY['Glutes', 'Core'], 'DB / BB', 'strength', 'quads', NULL, 'Squat', ARRAY['Lengthened'], true),
('Quads M Leg Press (M)', 'Quadriceps', ARRAY['Glutes'], 'M', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads DB Walking Lunge (M)', 'Quadriceps', ARRAY['Glutes', 'Hamstrings'], 'DB', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads BB Reverse Lunge (M)', 'Quadriceps', ARRAY['Glutes', 'Hamstrings'], 'BB', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads M Smith Lunge (M)', 'Quadriceps', ARRAY['Glutes'], 'M', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads DB Step-Up (M)', 'Quadriceps', ARRAY['Glutes', 'Core'], 'DB', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads DB Heel Elevated Squat (M)', 'Quadriceps', ARRAY['Glutes', 'Core'], 'DB / BB', 'strength', 'quads', NULL, 'Squat', ARRAY['Mid-range'], true),
('Quads DB Front Foot Elevated Split Squat (L)', 'Quadriceps', ARRAY['Glutes', 'Core'], 'DB', 'strength', 'quads', NULL, 'Squat', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 16.1 Biceps Femoris (Hamstrings - Leg Curl)
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Hamstrings M Seated Leg Curl (L)', 'Hamstrings', ARRAY['Calves (gastrocnemius)'], 'M', 'strength', 'hamstrings', NULL, 'Leg Curl', ARRAY['Lengthened'], true),
('Hamstrings M Lying Leg Curl (M)', 'Hamstrings', ARRAY['Calves (gastrocnemius)'], 'M', 'strength', 'hamstrings', NULL, 'Leg Curl', ARRAY['Mid-range'], true),
('Hamstrings M Standing Single-Leg Curl (M)', 'Hamstrings', ARRAY[]::text[], 'M', 'strength', 'hamstrings', NULL, 'Leg Curl', ARRAY['Mid-range'], true),
('Hamstrings C-FT Prone Leg Curl (L)', 'Hamstrings', ARRAY[]::text[], 'C-FT', 'strength', 'hamstrings', NULL, 'Leg Curl', ARRAY['Lengthened'], true),
('Hamstrings BW Nordic Curl (L)', 'Hamstrings', ARRAY[]::text[], 'BW', 'strength', 'hamstrings', NULL, 'Leg Curl', ARRAY['Lengthened'], true),
('Hamstrings BW Swiss Ball Curl (M)', 'Hamstrings', ARRAY['Glutes', 'Core'], 'BW', 'strength', 'hamstrings', NULL, 'Leg Curl', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 16.2 Semitendinosus & Semimembranosus (Hip Hinge)
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Hamstrings BB Romanian Deadlift (L)', 'Hamstrings', ARRAY['Glutes', 'Erector Spinae'], 'BB', 'strength', 'hamstrings', NULL, 'Hip Hinge (hamstring emphasis)', ARRAY['Lengthened'], true),
('Hamstrings DB Romanian Deadlift (L)', 'Hamstrings', ARRAY['Glutes', 'Core'], 'DB', 'strength', 'hamstrings', NULL, 'Hip Hinge (hamstring emphasis)', ARRAY['Lengthened'], true),
('Hamstrings DB Single-Leg RDL (L)', 'Hamstrings', ARRAY['Glutes', 'Core'], 'DB', 'strength', 'hamstrings', NULL, 'Hip Hinge (hamstring emphasis)', ARRAY['Lengthened'], true),
('Hamstrings BB Stiff-Leg Deadlift (L)', 'Hamstrings', ARRAY['Glutes', 'Erector Spinae'], 'BB', 'strength', 'hamstrings', NULL, 'Hip Hinge (hamstring emphasis)', ARRAY['Lengthened'], true),
('Hamstrings BB Good Morning (L)', 'Hamstrings', ARRAY['Erector Spinae', 'Glutes'], 'BB', 'strength', 'hamstrings', NULL, 'Hip Hinge (hamstring emphasis)', ARRAY['Lengthened'], true),
('Hamstrings C-FT Pull-Through (L)', 'Hamstrings', ARRAY['Glutes'], 'C-FT', 'strength', 'hamstrings', NULL, 'Hip Hinge (hamstring emphasis)', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 17.1 Gastrocnemius
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Gastrocnemius M Standing Calf Raise (S)', 'Calves', ARRAY['Soleus'], 'M', 'strength', 'calves', 'calves_gastrocnemius', 'Calf Raise (knee straight)', ARRAY['Shortened'], true),
('Gastrocnemius M Smith Standing Calf Raise (S)', 'Calves', ARRAY['Soleus'], 'M', 'strength', 'calves', 'calves_gastrocnemius', 'Calf Raise (knee straight)', ARRAY['Shortened'], true),
('Gastrocnemius M Leg Press Calf Raise (S)', 'Calves', ARRAY['Soleus'], 'M', 'strength', 'calves', 'calves_gastrocnemius', 'Calf Raise (knee straight)', ARRAY['Shortened'], true),
('Gastrocnemius DB Standing Calf Raise (S)', 'Calves', ARRAY['Soleus'], 'DB', 'strength', 'calves', 'calves_gastrocnemius', 'Calf Raise (knee straight)', ARRAY['Shortened'], true),
('Gastrocnemius DB Single-Leg Calf Raise (S)', 'Calves', ARRAY['Soleus'], 'DB', 'strength', 'calves', 'calves_gastrocnemius', 'Calf Raise (knee straight)', ARRAY['Shortened'], true),
('Gastrocnemius M Donkey Calf Raise (L)', 'Calves', ARRAY['Soleus'], 'M', 'strength', 'calves', 'calves_gastrocnemius', 'Calf Raise (knee straight)', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 17.2 Soleus
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Soleus M Seated Calf Raise (S)', 'Calves', ARRAY['Gastrocnemius (minimal)'], 'M', 'strength', 'calves', 'calves_soleus', 'Calf Raise (knee bent)', ARRAY['Shortened'], true),
('Soleus M Smith Seated Calf Raise (S)', 'Calves', ARRAY[]::text[], 'M', 'strength', 'calves', 'calves_soleus', 'Calf Raise (knee bent)', ARRAY['Shortened'], true),
('Soleus M Leg Press Bent-Knee Calf Raise (S)', 'Calves', ARRAY[]::text[], 'M', 'strength', 'calves', 'calves_soleus', 'Calf Raise (knee bent)', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 17.3 Tibialis Anterior
-- ---------------------------------------------------------------------------
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Tibialis BW Tib Raise (S)', 'Calves', ARRAY[]::text[], 'BW / DB', 'strength', 'calves', 'tibialis_anterior', 'Dorsiflexion', ARRAY['Shortened'], true),
('Tibialis BW Band Dorsiflexion (S)', 'Calves', ARRAY[]::text[], 'BW', 'strength', 'calves', 'tibialis_anterior', 'Dorsiflexion', ARRAY['Shortened'], true),
('Tibialis C-FT Dorsiflexion (S)', 'Calves', ARRAY[]::text[], 'C-FT', 'strength', 'calves', 'tibialis_anterior', 'Dorsiflexion', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 18. NECK
-- ---------------------------------------------------------------------------
-- Movement 1: Flexion / Extension
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Neck DB Supine Neck Curl (S)', 'Traps', ARRAY[]::text[], 'DB (plate)', 'strength', 'neck', NULL, 'Flexion / Extension', ARRAY['Shortened'], true),
('Neck DB Prone Neck Extension (S)', 'Traps', ARRAY[]::text[], 'DB (plate)', 'strength', 'neck', NULL, 'Flexion / Extension', ARRAY['Shortened'], true),
('Neck BW Band Neck Curl (M)', 'Traps', ARRAY[]::text[], 'BW', 'strength', 'neck', NULL, 'Flexion / Extension', ARRAY['Mid-range'], true),
('Neck BW Band Neck Extension (M)', 'Traps', ARRAY[]::text[], 'BW', 'strength', 'neck', NULL, 'Flexion / Extension', ARRAY['Mid-range'], true),
('Neck M Harness Extension (M)', 'Traps', ARRAY[]::text[], 'M', 'strength', 'neck', NULL, 'Flexion / Extension', ARRAY['Mid-range'], true),
('Neck M 4-Way Machine (M)', 'Traps', ARRAY[]::text[], 'M', 'strength', 'neck', NULL, 'Flexion / Extension', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Lateral Flexion
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Neck DB Side-Lying Lateral Flexion (S)', 'Traps', ARRAY[]::text[], 'DB (plate)', 'strength', 'neck', NULL, 'Lateral Flexion', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 19. CARDIO
-- ---------------------------------------------------------------------------
-- Movement 1: Machine Cardio
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Cardio Treadmill Running (M)', 'Cardiovascular', ARRAY['Hamstrings', 'Calves'], 'Treadmill', 'cardio', 'cardio', NULL, 'Machine Cardio', ARRAY['Mid-range'], true),
('Cardio Treadmill Incline Walking (M)', 'Cardiovascular', ARRAY['Glutes', 'Hamstrings', 'Calves'], 'Treadmill', 'cardio', 'cardio', NULL, 'Machine Cardio', ARRAY['Mid-range'], true),
('Cardio Stationary Bike (M)', 'Cardiovascular', ARRAY['Hamstrings'], 'Bike', 'cardio', 'cardio', NULL, 'Machine Cardio', ARRAY['Mid-range'], true),
('Cardio Rowing Machine (M)', 'Cardiovascular', ARRAY['Upper Back', 'Lats', 'Hamstrings', 'Core'], 'Rower', 'cardio', 'cardio', NULL, 'Machine Cardio', ARRAY['Mid-range'], true),
('Cardio Elliptical Trainer (M)', 'Cardiovascular', ARRAY['Glutes'], 'Elliptical', 'cardio', 'cardio', NULL, 'Machine Cardio', ARRAY['Mid-range'], true),
('Cardio Stair Climber (M)', 'Cardiovascular', ARRAY['Glutes', 'Calves'], 'Stair Climber', 'cardio', 'cardio', NULL, 'Machine Cardio', ARRAY['Mid-range'], true),
('Cardio Assault Bike (M)', 'Cardiovascular', ARRAY['Hamstrings', 'Shoulders'], 'Assault Bike', 'cardio', 'cardio', NULL, 'Machine Cardio', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Functional Cardio
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Cardio Jump Rope (M)', 'Cardiovascular', ARRAY['Calves', 'Shoulders', 'Core'], 'Jump Rope', 'cardio', 'cardio', NULL, 'Functional Cardio', ARRAY['Mid-range'], true),
('Cardio Battle Ropes (M)', 'Cardiovascular', ARRAY['Shoulders', 'Core', 'Arms'], 'Battle Ropes', 'cardio', 'cardio', NULL, 'Functional Cardio', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 20. MOBILITY / STRETCHING
-- ---------------------------------------------------------------------------
-- Movement 1: Foam Rolling
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Mobility Foam Roll Quadriceps (M)', 'Quadriceps', ARRAY[]::text[], 'Foam Roller', 'mobility', 'mobility', NULL, 'Foam Rolling', ARRAY['Mid-range'], true),
('Mobility Foam Roll IT Band (M)', 'Quadriceps', ARRAY[]::text[], 'Foam Roller', 'mobility', 'mobility', NULL, 'Foam Rolling', ARRAY['Mid-range'], true),
('Mobility Foam Roll Upper Back (M)', 'Upper Back', ARRAY[]::text[], 'Foam Roller', 'mobility', 'mobility', NULL, 'Foam Rolling', ARRAY['Mid-range'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Dynamic Mobility
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Mobility BW Hip 90/90 Stretch (L)', 'Hip Flexors', ARRAY['Glutes', 'Adductors'], 'BW', 'mobility', 'mobility', NULL, 'Dynamic Mobility', ARRAY['Lengthened'], true),
('Mobility BW World''s Greatest Stretch (L)', 'Hip Flexors', ARRAY['Hamstrings', 'Upper Back', 'Shoulders'], 'BW', 'mobility', 'mobility', NULL, 'Dynamic Mobility', ARRAY['Lengthened'], true),
('Mobility BW Cat-Cow (M)', 'Core', ARRAY['Core', 'Lower Back'], 'BW', 'mobility', 'mobility', NULL, 'Dynamic Mobility', ARRAY['Mid-range'], true),
('Mobility BW Thoracic Spine Rotation (M)', 'Upper Back', ARRAY['Core', 'Obliques'], 'BW', 'mobility', 'mobility', NULL, 'Dynamic Mobility', ARRAY['Mid-range'], true),
('Mobility BW Banded Shoulder Dislocate (L)', 'Rotator Cuff', ARRAY['Upper Back', 'Rotator Cuff'], 'Band', 'mobility', 'mobility', NULL, 'Dynamic Mobility', ARRAY['Lengthened'], true),
('Mobility BW Pigeon Stretch (L)', 'Glutes', ARRAY['Hip Flexors'], 'BW', 'mobility', 'mobility', NULL, 'Dynamic Mobility', ARRAY['Lengthened'], true),
('Mobility BW Couch Stretch (L)', 'Quadriceps', ARRAY['Quadriceps'], 'BW', 'mobility', 'mobility', NULL, 'Dynamic Mobility', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 21. WARMUP
-- ---------------------------------------------------------------------------
-- Movement 1: Activation
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Warmup Band Pull-Apart (S)', 'Upper Back', ARRAY['Upper Back', 'Rotator Cuff'], 'Band', 'warmup', 'warmup', NULL, 'Activation', ARRAY['Shortened'], true),
('Warmup Band External Rotation (S)', 'Rotator Cuff', ARRAY['Rear Delts'], 'Band', 'warmup', 'warmup', NULL, 'Activation', ARRAY['Shortened'], true),
('Warmup Band Glute Activation Walk (S)', 'Glutes', ARRAY['Abductors'], 'Band', 'warmup', 'warmup', NULL, 'Activation', ARRAY['Shortened'], true)
ON CONFLICT (name) DO NOTHING;

-- Movement 2: Dynamic Warmup
INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, muscle_group, subdivision, movement_pattern, resistance_profiles, is_global) VALUES
('Warmup BW Leg Swing (M)', 'Hip Flexors', ARRAY['Hamstrings', 'Glutes'], 'BW', 'warmup', 'warmup', NULL, 'Dynamic Warmup', ARRAY['Mid-range'], true),
('Warmup BW Arm Circle (M)', 'Rotator Cuff', ARRAY['Rotator Cuff'], 'BW', 'warmup', 'warmup', NULL, 'Dynamic Warmup', ARRAY['Mid-range'], true),
('Warmup BW Inchworm (L)', 'Core', ARRAY['Core', 'Shoulders'], 'BW', 'warmup', 'warmup', NULL, 'Dynamic Warmup', ARRAY['Lengthened'], true)
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- 6. ADD INDEXES on new taxonomy columns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_exercise_library_muscle_group ON public.exercise_library(muscle_group);
CREATE INDEX IF NOT EXISTS idx_exercise_library_subdivision ON public.exercise_library(subdivision) WHERE subdivision IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exercise_library_movement_pattern ON public.exercise_library(movement_pattern) WHERE movement_pattern IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exercise_library_machine_brand ON public.exercise_library(machine_brand) WHERE machine_brand IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_exercise_library_movement_pattern_id ON public.exercise_library(movement_pattern_id) WHERE movement_pattern_id IS NOT NULL;

COMMIT;
