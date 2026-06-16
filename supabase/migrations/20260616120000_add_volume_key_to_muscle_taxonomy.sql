-- Strength picker → DB taxonomy alignment (Phase A).
-- Adds an editable `volume_key` to the strength taxonomy lookups so the planning
-- board's strength picker can render the DB tree (7 regions / 24 muscles / 36
-- subdivisions) while still emitting the LEGACY muscle-builder slug that
-- useMusclePlanVolume / resolveParentMuscleId / MUSCLE_GROUPS key on. This keeps
-- the volume engine + persisted slot_config untouched (Phase B migrates volume
-- tracking to DB ids and drops this column).
--
-- volume_key is a plain editable text column (admin can re-point it later).
-- NULL volume_key = intentionally not volume-tracked (e.g. pelvic floor); the
-- picker hides those nodes.
-- See docs/STRENGTH_PICKER_TAXONOMY_ALIGNMENT.md.

ALTER TABLE public.muscles
  ADD COLUMN IF NOT EXISTS volume_key text;
ALTER TABLE public.muscle_subdivisions
  ADD COLUMN IF NOT EXISTS volume_key text;

COMMENT ON COLUMN public.muscles.volume_key IS
  'Legacy muscle-builder slug this muscle counts toward for volume landmarks (MUSCLE_GROUPS.id). NULL = not volume-tracked. Editable. Phase A of the strength-picker taxonomy alignment.';
COMMENT ON COLUMN public.muscle_subdivisions.volume_key IS
  'Legacy muscle-builder slug this subdivision counts toward (SUBDIVISIONS.id or parent MUSCLE_GROUPS.id when no 1:1 legacy split). NULL = not volume-tracked. Editable.';

-- ── Muscles (24) → legacy MUSCLE_GROUPS.id ───────────────────────────────────
UPDATE public.muscles SET volume_key = CASE slug
  WHEN 'pec_major'         THEN 'pecs'
  WHEN 'pec_minor'         THEN 'pec_minor'         -- new bucket (landmarks added in code)
  WHEN 'serratus_anterior' THEN 'serratus'
  WHEN 'lats'              THEN 'lats'
  WHEN 'upper_back'        THEN 'upper_mid_back'
  WHEN 'mid_back'          THEN 'upper_mid_back'
  WHEN 'lower_back'        THEN 'lower_back'         -- new bucket
  WHEN 'deltoids'          THEN 'shoulders'
  WHEN 'rotator_cuff'      THEN 'rotator_cuff'
  WHEN 'elbow_flexors'     THEN 'elbow_flexors'
  WHEN 'forearm'           THEN 'forearm'
  WHEN 'triceps'           THEN 'triceps'
  WHEN 'quads'             THEN 'quads'
  WHEN 'hamstrings'        THEN 'hamstrings'
  WHEN 'glutes'            THEN 'glutes'
  WHEN 'adductors'         THEN 'adductors'
  WHEN 'abductors'         THEN 'abductors'
  WHEN 'hip_flexors'       THEN 'hip_flexors'
  WHEN 'calves'            THEN 'calves'
  WHEN 'tibialis_anterior' THEN 'tibialis'
  WHEN 'rectus_abdominis'  THEN 'core'
  WHEN 'obliques'          THEN 'obliques'           -- new bucket
  WHEN 'pelvic_muscles'    THEN NULL                 -- intentionally not tracked
  WHEN 'neck'              THEN 'neck'
  ELSE volume_key
END;

-- ── Subdivisions (36) → legacy SUBDIVISIONS.id (or parent muscle slug) ────────
UPDATE public.muscle_subdivisions SET volume_key = CASE slug
  WHEN 'gastrocnemius'        THEN 'calves_gastrocnemius'
  WHEN 'soleus'               THEN 'calves_soleus'
  WHEN 'deltoid_anterior'     THEN 'shoulders_anterior'
  WHEN 'deltoid_lateral'      THEN 'shoulders_lateral'
  WHEN 'deltoid_posterior'    THEN 'shoulders_posterior'
  WHEN 'biceps_long'          THEN 'elbow_flexors_biceps_long'
  WHEN 'biceps_short'         THEN 'elbow_flexors_biceps_short'
  WHEN 'brachialis'           THEN 'elbow_flexors_brachialis'
  WHEN 'brachioradialis'      THEN 'elbow_flexors_brachioradialis'
  WHEN 'forearm_extensors'    THEN 'forearm_extensors'
  WHEN 'forearm_flexors'      THEN 'forearm_flexors'
  WHEN 'forearm_pronators'    THEN 'forearm_pronators'
  WHEN 'forearm_supinators'   THEN 'forearm_supinators'
  WHEN 'glute_max'            THEN 'glutes_max'
  WHEN 'glute_med'            THEN 'glutes_med'
  WHEN 'glute_min'            THEN 'glutes_min'
  WHEN 'lats_iliac'           THEN 'lats_iliac'
  WHEN 'lats_lumbar'          THEN 'lats_lumbar'
  WHEN 'lats_thoracic'        THEN 'lats_thoracic'
  WHEN 'spinal_erectors'      THEN 'lower_back'       -- new parent bucket (no legacy split)
  WHEN 'lower_traps'          THEN 'mid_back_low_traps'
  WHEN 'mid_traps'            THEN 'mid_back_mid_traps'
  WHEN 'rhomboids'            THEN 'mid_back_rhomboids'
  WHEN 'pec_major_clavicular' THEN 'pecs_clavicular'
  WHEN 'pec_major_costal'     THEN 'pecs_costal'
  WHEN 'pec_major_sternal'    THEN 'pecs_sternal'
  WHEN 'rectus_femoris'       THEN 'quads_rectus_femoris'
  WHEN 'vastii'               THEN 'quads'            -- DB collapses 3 vastii → muscle level
  WHEN 'infraspinatus'        THEN 'rotator_cuff_infraspinatus'
  WHEN 'subscapularis'        THEN 'rotator_cuff_subscapularis'
  WHEN 'supraspinatus'        THEN 'rotator_cuff_supraspinatus'
  WHEN 'teres_minor'          THEN 'rotator_cuff_teres_minor'
  WHEN 'triceps_lateral_medial' THEN 'triceps_lat_med'
  WHEN 'triceps_long'         THEN 'triceps_long'
  WHEN 'teres_major'          THEN 'upper_back_teres_major'
  WHEN 'upper_traps'          THEN 'upper_back_upper_traps'
  ELSE volume_key
END;
