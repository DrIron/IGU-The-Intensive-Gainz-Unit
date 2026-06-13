-- Exercise Library Redesign — make exercise_library.primary_muscle nullable.
-- muscle_id (Phase 2) is now the source of truth for an exercise's muscle; the
-- free-text primary_muscle is a display mirror. New rows derive it from the chosen
-- muscle in the authoring form, but the NOT NULL constraint is no longer needed.
-- Dropped entirely in Phase 6 once all display reads go through muscle_id.

ALTER TABLE public.exercise_library ALTER COLUMN primary_muscle DROP NOT NULL;
