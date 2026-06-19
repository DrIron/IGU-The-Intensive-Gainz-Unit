-- Enforce a single active nutrition goal per user.
--
-- Bug: the client goal page (NutritionGoal.tsx) inserted a new is_active=true
-- row on every save without deactivating the prior active goal, and nothing in
-- the DB prevented two active rows. loadActiveGoal() then used .maybeSingle(),
-- which throws when more than one row matches -> intermittent
-- "Failed to load nutrition goal".
--
-- This migration (a) collapses any existing duplicates by keeping only the
-- newest active goal per user, then (b) adds a partial unique index so a second
-- active row can never be inserted. The frontend now deactivates-before-insert
-- (and the loader orders + limit(1)s) to coexist with this guard.

-- (a) Deactivate all but the newest active goal per user.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM public.nutrition_goals
  WHERE is_active = true
)
UPDATE public.nutrition_goals g
SET is_active = false
FROM ranked r
WHERE g.id = r.id
  AND r.rn > 1;

-- (b) One active goal per user.
CREATE UNIQUE INDEX IF NOT EXISTS nutrition_goals_one_active_per_user
  ON public.nutrition_goals (user_id)
  WHERE is_active;
