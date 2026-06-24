-- ============================================================
-- One-time cleanup of AUDIT -- 2026-04-21 test artifacts.
--
-- The 2026-04-21 workout audit created a labelled client program to
-- exercise the assign -> log -> review flow end-to-end on production.
-- Every artifact used `AUDIT -- 2026-04-21` in its title/name so it could
-- be filtered + removed in one pass.
--
-- This migration deletes those rows in child-first order. It logs row
-- counts via RAISE NOTICE so the `supabase db push` output clearly shows
-- what was removed. If any count looks unexpectedly large the whole
-- transaction rolls back -- all DELETEs run inside the migration's
-- implicit transaction.
--
-- Scope (top-level parents, matched by name prefix):
--   * muscle_program_templates  -- Planning Board drafts
--   * program_templates         -- converted mesocycle programs
--   * macrocycles               -- multi-mesocycle blocks
--   * client_programs           -- assigned program instances (via
--                                  source_template_id)
--
-- Child rows (client_program_days, client_day_modules,
-- client_module_exercises, exercise_set_logs, module_threads,
-- program_template_days, day_modules, module_exercises,
-- exercise_prescriptions, etc.) are expected to CASCADE from their
-- parents; if any remain orphaned after this runs we'll catch them in a
-- follow-up.
-- ============================================================

DO $$
DECLARE
  v_audit_templates INT;
  v_audit_client_programs INT;
  v_audit_macrocycles INT;
  v_audit_muscle_plans INT;
BEGIN
  -- Pre-check counts so the push log shows what we're about to remove.
  SELECT COUNT(*) INTO v_audit_templates
  FROM program_templates
  WHERE title LIKE 'AUDIT -- 2026-04-21%' OR title LIKE 'AUDIT — 2026-04-21%';

  SELECT COUNT(*) INTO v_audit_macrocycles
  FROM macrocycles
  WHERE name LIKE 'AUDIT -- 2026-04-21%' OR name LIKE 'AUDIT — 2026-04-21%';

  SELECT COUNT(*) INTO v_audit_muscle_plans
  FROM muscle_program_templates
  WHERE name LIKE 'AUDIT -- 2026-04-21%' OR name LIKE 'AUDIT — 2026-04-21%';

  SELECT COUNT(*) INTO v_audit_client_programs
  FROM client_programs cp
  JOIN program_templates pt ON pt.id = cp.source_template_id
  WHERE pt.title LIKE 'AUDIT -- 2026-04-21%' OR pt.title LIKE 'AUDIT — 2026-04-21%';

  RAISE NOTICE 'Audit cleanup pre-counts: program_templates=%, client_programs=%, macrocycles=%, muscle_plans=%',
    v_audit_templates, v_audit_client_programs, v_audit_macrocycles, v_audit_muscle_plans;

  -- Sanity guard: if we match more than 50 of any parent something is
  -- wrong with the pattern -- bail before we wipe real data.
  IF v_audit_templates > 50 OR v_audit_client_programs > 50
     OR v_audit_macrocycles > 50 OR v_audit_muscle_plans > 50 THEN
    RAISE EXCEPTION 'Audit cleanup guard tripped: pattern matched too many rows (templates=%, client_programs=%, macrocycles=%, muscle_plans=%). Aborting.',
      v_audit_templates, v_audit_client_programs, v_audit_macrocycles, v_audit_muscle_plans;
  END IF;

  -- Child-first deletes. CASCADE FKs should handle deeper descendants.
  DELETE FROM client_programs
  WHERE source_template_id IN (
    SELECT id FROM program_templates
    WHERE title LIKE 'AUDIT -- 2026-04-21%' OR title LIKE 'AUDIT — 2026-04-21%'
  );

  DELETE FROM program_templates
  WHERE title LIKE 'AUDIT -- 2026-04-21%' OR title LIKE 'AUDIT — 2026-04-21%';

  DELETE FROM macrocycles
  WHERE name LIKE 'AUDIT -- 2026-04-21%' OR name LIKE 'AUDIT — 2026-04-21%';

  DELETE FROM muscle_program_templates
  WHERE name LIKE 'AUDIT -- 2026-04-21%' OR name LIKE 'AUDIT — 2026-04-21%';

  RAISE NOTICE 'Audit cleanup complete.';
END $$;
