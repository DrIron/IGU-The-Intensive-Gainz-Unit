-- D3 (§C, Hasan-decided 2026-07-04): drop ONLY the legacy FK from progression_suggestions
-- so Stage B can drop client_module_exercises. The table is empty (0 rows) and progression is
-- dormant (of 2983 plan_slots, 1904 carry linear_progression_enabled but 0 are true), and the
-- write path in useProgressionSuggestions never fires under canonical (guarded off). No runtime
-- reads/writes the column. Do NOT re-home the schema now — progression is rebuilt on canonical
-- keys (assignment_id + plan_slot_id) as a separate future feature. Zero data risk.
-- No functions touched, so no REVOKE/GRANT changes.
ALTER TABLE public.progression_suggestions
  DROP CONSTRAINT IF EXISTS progression_suggestions_client_module_exercise_id_fkey;
