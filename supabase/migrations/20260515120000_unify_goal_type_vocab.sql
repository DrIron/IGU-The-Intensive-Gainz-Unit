-- Unify goal_type vocabulary across nutrition tables on the DB-vocab
-- (fat_loss / muscle_gain / maintenance).
--
-- Background: nutrition_phases already has a CHECK constraint enforcing the DB
-- vocab. nutrition_goals (legacy table, still actively written by the
-- self-service calorie calculator path in src/components/nutrition/NutritionGoal.tsx)
-- has historically held the short FORM vocab (loss / gain / maintenance) with
-- NO CHECK constraint, leading to a two-vocab split across the codebase.
--
-- This migration backfills nutrition_goals to the DB vocab and adds a matching
-- CHECK constraint so both tables now speak the same language.
--
-- Pre-flight snapshot (run 2026-05-16 against remote):
--   nutrition_phases: { fat_loss: 2 }                            -- already DB vocab
--   nutrition_goals:  { loss: 2 }                                -- needs backfill
--   nutrition_goals garbage (NULL or unknown values): 0 rows
--
-- Re-runnable: DROP CONSTRAINT IF EXISTS guards the ADD; UPDATEs are guarded
-- by WHERE goal_type = '...' so they're no-ops on already-migrated data.

-- ---------------------------------------------------------------------------
-- 1. Backfill nutrition_goals FORM vocab -> DB vocab
-- ---------------------------------------------------------------------------

UPDATE public.nutrition_goals
SET goal_type = 'fat_loss'
WHERE goal_type = 'loss';

UPDATE public.nutrition_goals
SET goal_type = 'muscle_gain'
WHERE goal_type = 'gain';

UPDATE public.nutrition_goals
SET goal_type = 'maintenance'
WHERE goal_type = 'maintenance';
-- ^ no-op; included for symmetry so the mapping is explicit in the migration.

-- No garbage / NULL rows existed at pre-flight. If any unclassifiable rows
-- appear by the time this runs in another environment, the CHECK below will
-- fail loudly -- that is preferable to silently defaulting them to
-- 'maintenance' and masking real data corruption. If you hit such a failure,
-- inspect the offending rows and decide per-row before re-running.

-- ---------------------------------------------------------------------------
-- 2. Add CHECK constraint to nutrition_goals
-- ---------------------------------------------------------------------------
-- nutrition_phases already enforces CHECK (goal_type IN ('fat_loss',
-- 'maintenance', 'muscle_gain')) via the constraint set in
-- 20251024110553_4df12233-4b37-48e9-8204-b51105c408b6.sql -- intentionally not
-- touched here. After this migration, both tables match.

ALTER TABLE public.nutrition_goals
  DROP CONSTRAINT IF EXISTS nutrition_goals_goal_type_check;

ALTER TABLE public.nutrition_goals
  ADD CONSTRAINT nutrition_goals_goal_type_check
  CHECK (goal_type IN ('fat_loss', 'muscle_gain', 'maintenance'));

-- ---------------------------------------------------------------------------
-- 3. Verification (commented out -- uncomment to inspect post-backfill)
-- ---------------------------------------------------------------------------
-- SELECT 'nutrition_phases' AS table_name, goal_type, COUNT(*) AS row_count
-- FROM public.nutrition_phases
-- GROUP BY goal_type
-- UNION ALL
-- SELECT 'nutrition_goals' AS table_name, goal_type, COUNT(*) AS row_count
-- FROM public.nutrition_goals
-- GROUP BY goal_type
-- ORDER BY table_name, row_count DESC;
