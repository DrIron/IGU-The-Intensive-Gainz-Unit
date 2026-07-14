-- The diary snapshot must include the food's NAME.
--
-- §4.3 denormalizes kcal/macros/micros onto each entry so "the diary is an immutable
-- historical record" that later food edits cannot rewrite. The name is part of that record
-- and was missing: with `food_id` nullable (ON DELETE SET NULL, so a food deletion can never
-- destroy logged history), an entry whose food was removed would have had macros but nothing
-- to call itself — an unreadable row in the client's own diary.
--
-- Same reasoning as the macros. Snapshot it.

ALTER TABLE public.food_log_entries
  ADD COLUMN IF NOT EXISTS food_name TEXT NOT NULL DEFAULT '';

-- Backfill is a no-op today (the table is empty — P1 is the first writer), but keep it
-- correct in case this lands after any row exists.
UPDATE public.food_log_entries e
SET food_name = f.name
FROM public.foods f
WHERE e.food_id = f.id AND e.food_name = '';

ALTER TABLE public.food_log_entries ALTER COLUMN food_name DROP DEFAULT;
