-- Unified weekly check-in: keep the client's free-text note and the
-- "noticeable physical changes" choice ON the phase-scoped adherence_logs row.
--
-- Previously these went to weekly_progress, whose goal_id is a FK to
-- nutrition_goals(id). The client check-in passes a nutrition_phases id, and
-- phases/goals are disjoint id spaces, so that write always 409'd (FK
-- violation) for phase-based clients. adherence_logs.phase_id is a valid FK,
-- so the whole check-in now persists in one place.
--
-- Additive + idempotent.

ALTER TABLE public.adherence_logs
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS physical_changes TEXT;
