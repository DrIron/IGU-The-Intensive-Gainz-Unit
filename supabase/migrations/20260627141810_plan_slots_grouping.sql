-- Program system unification — P1 schema addendum: superset / circuit grouping on
-- plan_slots. See docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md "Planning Board v2 +
-- prescription model" (net-new #1). Baked in during P1 so we never re-migrate; the
-- builder UI that emits these is P4, the resolver is P3. Data-shape only here.
--
-- Slots sharing a group_id render as one bracket (superset/circuit) with shared rounds.
ALTER TABLE public.plan_slots
  ADD COLUMN IF NOT EXISTS group_id   uuid,
  ADD COLUMN IF NOT EXISTS group_type text,
  ADD COLUMN IF NOT EXISTS rounds     int;

-- group_type constrained to the two bracket kinds (NULL = ungrouped). Guarded so a
-- re-run / fresh local DB is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plan_slots_group_type_check'
      AND conrelid = 'public.plan_slots'::regclass
  ) THEN
    ALTER TABLE public.plan_slots
      ADD CONSTRAINT plan_slots_group_type_check
      CHECK (group_type IN ('superset', 'circuit'));
  END IF;
END $$;

-- Bracket lookups (render all slots in a group together).
CREATE INDEX IF NOT EXISTS idx_plan_slots_group
  ON public.plan_slots (group_id) WHERE group_id IS NOT NULL;
