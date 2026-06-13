-- ============================================================
-- Activity logging — performed-metric storage for non-strength items
--
-- Context: Exercise-library redesign, Option B. Non-strength activities
-- (cardio, carry, throw, mobility, HIIT rounds, ...) are now real
-- exercise_library exercises placed in program modules. The coach configures
-- which inputs the client fills via the EXISTING column system
-- (exercise_prescriptions.column_config + sets_json + coach_column_presets),
-- reusing ClientInputColumnType columns like performed_time / performed_distance
-- / performed_hr / performed_calories (+ new pace/side/rounds types).
--
-- The ONLY piece the existing schema can't already absorb is the *performed*
-- side: exercise_set_logs has typed columns for weight/reps/RIR/RPE only
-- (performed_load, performed_reps, performed_rir, performed_rpe). There is
-- nowhere to store performed time / distance / pace / HR / calories / side /
-- rounds. Everything else is already JSONB and needs no migration:
--   * exercise_prescriptions.column_config  (Json)  — new column-type strings
--   * exercise_prescriptions.sets_json       (Json)  — time_seconds / distance_meters
--                                                       already exist; pace/side/rounds
--                                                       ride along as extra keys
--   * coach_column_presets.column_config     (Json)  — per-category default presets
--   * module_exercises.exercise_id (NOT NULL) — satisfied; every slot has a real exercise
--
-- Approach: one flexible JSONB blob rather than a typed column per metric. This
-- keeps the four core typed columns intact (so existing history / personal-best /
-- progression queries that read performed_load & performed_reps keep working),
-- and lets any current OR future client-input column type be logged without a
-- follow-up migration. The client logger writes the configured input columns'
-- values here keyed by ClientInputColumnType (e.g.
--   { "performed_distance": 5000, "performed_time": 1380, "performed_pace": "5:30/km", "performed_hr": 152 }
-- ), while weight/reps/RIR/RPE continue to populate their dedicated columns when
-- present.
--
-- Non-destructive: adds one nullable column with a default. No RLS change needed
-- (row-level INSERT/UPDATE policies on exercise_set_logs already gate by owner;
-- the new column inherits that). The UNIQUE (client_module_exercise_id, set_index)
-- constraint is untouched, so the existing upsert onConflict target still works.
-- A non-set activity logs as a single row (set_index = 1); a rounds-based item
-- logs one row per round (set_index = round number).
-- ============================================================

ALTER TABLE public.exercise_set_logs
  ADD COLUMN IF NOT EXISTS performed_json JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.exercise_set_logs.performed_json IS
  'Non-core performed metrics for activity logging, keyed by ClientInputColumnType '
  '(performed_time, performed_distance, performed_pace, performed_hr, '
  'performed_calories, performed_side, performed_rounds, ...). Core weight/reps/RIR/RPE '
  'stay in their dedicated columns; this blob holds everything else the coach '
  'configured via column_config. Defaults to {} so existing strength rows are unaffected.';
