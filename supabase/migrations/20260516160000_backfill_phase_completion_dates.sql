-- Backfill `completed_at` and `end_date` on past nutrition_phases.
--
-- Background: nutrition_phases has had `completed_at` (timestamptz) and
-- `end_date` (timestamptz) since migration 20251027174418, but no app code has
-- ever written them. Deactivation happens app-side
-- (src/components/nutrition/CoachNutritionGoal.tsx:298) by flipping
-- `is_active=false` and nothing else. As a result, every past phase in prod /
-- staging carries NULL for both columns. The upcoming Phase History UI needs
-- a reliable "this phase ended on X" signal -- this migration backfills the
-- existing rows so that signal is consistent on day one of the new UI.
--
-- Pre-flight snapshot (run 2026-05-16 against remote):
--   nutrition_phases: { is_active=true: 2 }   -- no past phases exist on prod
--   past_phases_needing_completed_at_backfill: 0
--   past_phases_needing_end_date_backfill:    0
--
-- So this migration is a no-op against the current remote dataset, but stays
-- load-bearing for:
--   - staging / dev databases that may carry past phases from earlier seeds
--   - the first real "create new phase" action on prod, which (until the
--     follow-up CoachNutritionGoal.tsx change in sub-step 2c) will continue
--     to flip is_active without writing completion timestamps -- this script
--     can be re-run to mop those up.
--
-- Why no trigger: the existing pattern is app-side deactivation inside the
-- same render flow that inserts the new phase. Sub-step 2c will update that
-- code to write completed_at + end_date in the same UPDATE statement, keeping
-- a single source of truth in the app layer. A DB trigger would duplicate
-- that logic and obscure the write site.
--
-- Re-runnable: WHERE completed_at IS NULL / WHERE end_date IS NULL guards
-- mean already-backfilled rows are skipped.

-- ---------------------------------------------------------------------------
-- 1. Backfill completed_at on past phases
-- ---------------------------------------------------------------------------
-- For each past phase, completed_at := the NEXT phase's start_date for the
-- same user (i.e. "this phase ended when the next one started"). If no next
-- phase exists -- the user moved on or deactivated their phase without
-- replacing it -- fall back to the row's own updated_at, which captures the
-- moment `is_active` was flipped to false in the existing app flow.

WITH next_phase AS (
  SELECT
    id,
    LEAD(start_date) OVER (PARTITION BY user_id ORDER BY start_date) AS next_start
  FROM public.nutrition_phases
)
UPDATE public.nutrition_phases AS p
SET completed_at = COALESCE(np.next_start, p.updated_at)
FROM next_phase AS np
WHERE p.id = np.id
  AND p.is_active = false
  AND p.completed_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Backfill end_date from completed_at (keep the two columns aligned)
-- ---------------------------------------------------------------------------
-- end_date and completed_at express the same fact in two columns. Going
-- forward they should always be in sync; this UPDATE establishes that
-- invariant on the historical rows that just got a completed_at value (or
-- already had one from any other path).

UPDATE public.nutrition_phases
SET end_date = completed_at
WHERE is_active = false
  AND end_date IS NULL
  AND completed_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Verification (commented out -- uncomment to inspect post-backfill state)
-- ---------------------------------------------------------------------------
-- SELECT
--   p.id,
--   p.user_id,
--   p.phase_name,
--   p.start_date,
--   p.is_active,
--   p.completed_at,
--   p.end_date,
--   p.updated_at,
--   LEAD(p.start_date) OVER (PARTITION BY p.user_id ORDER BY p.start_date)
--     AS next_phase_start_date
-- FROM public.nutrition_phases p
-- ORDER BY p.user_id, p.start_date;
