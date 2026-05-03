-- Phase 1A migration 3/6 — Coach column-ownership refactor
-- Pattern A: for every duplicate column (coaches AND coaches_public),
-- where coaches_public is NULL/empty AND coaches has a value, copy from
-- coaches → coaches_public. Where BOTH sides are populated and differ,
-- log the conflict to coach_refactor_conflicts (do NOT auto-resolve).
--
-- After this migration runs, admin reviews
-- `SELECT * FROM coach_refactor_conflicts WHERE resolved_at IS NULL`
-- and resolves each row manually. The 1A → 1B gate requires zero
-- unresolved rows.
--
-- Idempotent: re-running re-detects the same conflicts (ON CONFLICT
-- (user_id, column_name) DO UPDATE refreshes the captured values), and
-- the COALESCE-based UPDATE only changes empty cells, never overwrites
-- populated ones.
--
-- Note: array columns (qualifications, specializations, specialties)
-- compare via text cast for the conflict detection. Empty array '{}'
-- vs NULL are treated as both-empty (no conflict).

-- ─────────────────────────────────────────────────────────────────────
-- Step 1 — detect and log conflicts (both sides populated, values differ)
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO public.coach_refactor_conflicts (
  user_id, column_name, coaches_value, coaches_public_value
)
SELECT
  c.user_id,
  t.col,
  t.c_val,
  t.cp_val
FROM public.coaches c
JOIN public.coaches_public cp ON cp.user_id = c.user_id
CROSS JOIN LATERAL (VALUES
  ('first_name',          c.first_name,                    cp.first_name),
  ('last_name',           c.last_name,                     cp.last_name),
  ('nickname',            c.nickname,                      cp.nickname),
  ('bio',                 c.bio,                           cp.bio),
  ('short_bio',           c.short_bio,                     cp.short_bio),
  ('location',            c.location,                      cp.location),
  ('profile_picture_url', c.profile_picture_url,           cp.profile_picture_url),
  ('qualifications',      c.qualifications::text,          cp.qualifications::text),
  ('specializations',     c.specializations::text,         cp.specializations::text),
  ('specialties',         c.specialties::text,             cp.specialties::text)
) AS t(col, c_val, cp_val)
WHERE t.c_val IS DISTINCT FROM t.cp_val
  AND COALESCE(NULLIF(t.c_val, ''),  '__null__') <> '__null__'
  AND COALESCE(NULLIF(t.cp_val, ''), '__null__') <> '__null__'
  -- Ignore pseudo-conflicts on empty arrays where one side is '{}' and
  -- the other is also '{}' (both treated as empty)
  AND NOT (t.c_val = '{}' AND t.cp_val = '{}')
ON CONFLICT (user_id, column_name) DO UPDATE SET
  coaches_value         = EXCLUDED.coaches_value,
  coaches_public_value  = EXCLUDED.coaches_public_value,
  -- Re-detection clears any stale resolution
  resolved_value        = CASE
    WHEN coach_refactor_conflicts.resolved_value IS NOT NULL
     AND (
       coach_refactor_conflicts.coaches_value IS DISTINCT FROM EXCLUDED.coaches_value
       OR coach_refactor_conflicts.coaches_public_value IS DISTINCT FROM EXCLUDED.coaches_public_value
     )
    THEN NULL
    ELSE coach_refactor_conflicts.resolved_value
  END,
  resolved_at = CASE
    WHEN coach_refactor_conflicts.resolved_value IS NOT NULL
     AND (
       coach_refactor_conflicts.coaches_value IS DISTINCT FROM EXCLUDED.coaches_value
       OR coach_refactor_conflicts.coaches_public_value IS DISTINCT FROM EXCLUDED.coaches_public_value
     )
    THEN NULL
    ELSE coach_refactor_conflicts.resolved_at
  END;

-- ─────────────────────────────────────────────────────────────────────
-- Step 2 — fill empty coaches_public cells from coaches
-- (only changes coaches_public; coaches is left untouched until Phase 3)
-- ─────────────────────────────────────────────────────────────────────

UPDATE public.coaches_public cp
SET
  first_name          = COALESCE(NULLIF(cp.first_name, ''),          c.first_name),
  last_name           = COALESCE(NULLIF(cp.last_name, ''),           c.last_name),
  nickname            = COALESCE(NULLIF(cp.nickname, ''),            c.nickname),
  bio                 = COALESCE(NULLIF(cp.bio, ''),                 c.bio),
  short_bio           = COALESCE(NULLIF(cp.short_bio, ''),           c.short_bio),
  location            = COALESCE(NULLIF(cp.location, ''),            c.location),
  profile_picture_url = COALESCE(NULLIF(cp.profile_picture_url, ''), c.profile_picture_url),
  qualifications      = CASE
    WHEN COALESCE(array_length(cp.qualifications, 1), 0) = 0 THEN c.qualifications
    ELSE cp.qualifications
  END,
  specializations     = CASE
    WHEN COALESCE(array_length(cp.specializations, 1), 0) = 0 THEN c.specializations
    ELSE cp.specializations
  END,
  specialties         = CASE
    WHEN COALESCE(array_length(cp.specialties, 1), 0) = 0 THEN c.specialties
    ELSE cp.specialties
  END
FROM public.coaches c
WHERE cp.user_id = c.user_id;

-- ─────────────────────────────────────────────────────────────────────
-- Step 3 — informational summary
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_unresolved INTEGER;
  v_total      INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total FROM public.coach_refactor_conflicts;
  SELECT COUNT(*) INTO v_unresolved
    FROM public.coach_refactor_conflicts WHERE resolved_at IS NULL;

  RAISE NOTICE 'coach_refactor_conflicts: % total rows, % unresolved', v_total, v_unresolved;
  IF v_unresolved > 0 THEN
    RAISE NOTICE 'Admin must resolve unresolved conflicts before promoting 1A → 1B.';
    RAISE NOTICE '  Query: SELECT * FROM coach_refactor_conflicts WHERE resolved_at IS NULL;';
  END IF;
END $$;
