-- Exercise Library Redesign — add sport_specific to the category vocabulary.
-- Part of unifying the library `category` with the planning board's session types
-- (strength, cardio, mobility, warmup, cooldown, physio, sport_specific). The
-- board-side mapping (hiit -> cardio, yoga_mobility -> mobility, recovery -> cooldown)
-- is frontend logic handled in Phase 5.
--
-- ALTER TYPE ... ADD VALUE is kept alone in this file (cannot be used in the same
-- transaction it is added in; isolated to avoid that hazard on db push).

ALTER TYPE public.exercise_category ADD VALUE IF NOT EXISTS 'sport_specific';
