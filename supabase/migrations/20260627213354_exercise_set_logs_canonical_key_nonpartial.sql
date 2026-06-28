-- Program system unification P3/P4 fix — canonical set-log upsert returned 400 on every write.
-- exercise_set_logs_canonical_key was a PARTIAL unique index (WHERE assignment_id IS NOT NULL);
-- PostgREST's ?on_conflict=assignment_id,plan_slot_id,set_index can't carry the partial
-- predicate, so Postgres rejects it as a valid ON CONFLICT arbiter (42P10) → 400, no row.
--
-- Make it NON-partial so the on_conflict resolves. Uniqueness is unchanged in practice:
-- canonical rows always have non-null (assignment_id, plan_slot_id); legacy rows are
-- (NULL, NULL, set_index) and stay distinct under the default NULLS DISTINCT (PG17), so no
-- collisions. The exercise_set_logs_keying_check stays as-is.
DROP INDEX IF EXISTS public.exercise_set_logs_canonical_key;
CREATE UNIQUE INDEX exercise_set_logs_canonical_key
  ON public.exercise_set_logs (assignment_id, plan_slot_id, set_index);
