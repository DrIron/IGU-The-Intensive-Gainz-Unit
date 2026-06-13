-- Exercise Library Redesign — Phase 5f: drop the legacy `exercises` table.
--
-- `exercise_library` is now the single source of truth. The legacy `exercises`
-- table held 97 pre-v2 rows with zero inbound foreign keys, zero dependent views,
-- and zero name overlap with exercise_library. All code readers/writers were
-- removed first (WorkoutLibrary.tsx rewritten read-only; dead WorkoutLibraryManager.tsx
-- + ExerciseQuickAdd.tsx deleted) — verified `from('exercises')` returns zero matches
-- across src/. Safe, dependency-free drop.

DROP TABLE IF EXISTS public.exercises;
