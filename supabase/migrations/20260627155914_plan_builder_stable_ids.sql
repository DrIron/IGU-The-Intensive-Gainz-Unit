-- Program system unification — stable slot/session identity (P4 prerequisite). See
-- docs/PROGRAM_SYSTEM_UNIFICATION_BUILD_PLAN.md §P4 "⚠️ Prerequisite — stable slot identity".
--
-- save_plan_from_builder previously delete-and-recreated plan_*, so plan_slots.id churned
-- on every coach save and exercise_set_logs.plan_slot_id orphaned. These columns carry the
-- builder's already-stable ids (slot_config MuscleSlotData.id / SessionData.id) so the
-- materializer can UPSERT by them and preserve plan_slots.id / plan_sessions.id across saves.
--
-- ADDITIVE: nullable (legacy rows created before this stay NULL until their next save, which
-- reinserts them with builder ids). Partial unique per plan (NULLs excluded) so a re-save /
-- fresh local DB is idempotent and the ON CONFLICT targets resolve.

ALTER TABLE public.plan_sessions ADD COLUMN IF NOT EXISTS builder_session_id uuid;
ALTER TABLE public.plan_slots    ADD COLUMN IF NOT EXISTS builder_slot_id    uuid;

CREATE UNIQUE INDEX IF NOT EXISTS plan_sessions_plan_builder_session_key
  ON public.plan_sessions (plan_id, builder_session_id) WHERE builder_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS plan_slots_plan_builder_slot_key
  ON public.plan_slots (plan_id, builder_slot_id) WHERE builder_slot_id IS NOT NULL;
