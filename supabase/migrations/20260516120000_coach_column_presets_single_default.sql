-- ============================================================
-- Enforce: at most one default column preset per coach.
--
-- Background: coach_column_presets has UNIQUE(coach_id, name) but no
-- constraint that at most one row per coach has is_default = true. The
-- application paths that read the default
--   - src/components/coach/programs/muscle-builder/ConvertToProgram.tsx
--     (uses .maybeSingle())
--   - src/hooks/useColumnConfig.ts (uses .single())
-- assume the invariant holds. A coach with two defaults triggers a
-- PostgREST 406 ("multiple rows returned") and breaks the convert flow.
--
-- The drift source today is useColumnConfig.setDefaultPreset(): a
-- non-atomic two-step update (un-set all → set new) with no error
-- destructure on the un-set step. Concurrent invocations or a silent
-- RLS denial on the un-set can leave the table with multiple defaults.
-- Fixing that helper to a single UPDATE (or wrapping it in a SECURITY
-- DEFINER RPC) is the application-side follow-up; this migration is the
-- database-level safety net so the invariant cannot drift again.
--
-- Steps:
--   1. Demote any existing duplicates, keeping the most-recently-created
--      default per coach.
--   2. Create a partial unique index that allows multiple non-defaults
--      per coach but at most one is_default = true.
-- ============================================================

-- 1. Defensive de-dup: if prod already has any coach with multiple
--    defaults, demote all but the most-recently-created one.
UPDATE public.coach_column_presets
   SET is_default = false
 WHERE is_default = true
   AND id NOT IN (
     SELECT DISTINCT ON (coach_id) id
       FROM public.coach_column_presets
      WHERE is_default = true
      ORDER BY coach_id, created_at DESC
   );

-- 2. Partial unique index. Multiple is_default = false rows per coach are
--    fine (and expected); only the true rows are constrained to one.
CREATE UNIQUE INDEX IF NOT EXISTS coach_column_presets_one_default_per_coach
  ON public.coach_column_presets (coach_id)
  WHERE is_default = true;

COMMENT ON INDEX public.coach_column_presets_one_default_per_coach IS
  'Enforces at most one is_default = true row per coach. Required by '
  'ConvertToProgram.tsx (.maybeSingle()) and useColumnConfig.ts (.single()) '
  'preset lookups; without it, any drift causes PostgREST 406 errors.';
