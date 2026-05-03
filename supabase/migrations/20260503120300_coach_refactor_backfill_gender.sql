-- Phase 1A migration 4/6 — Coach column-ownership refactor
-- Pattern C: copy gender from coaches → coaches_private where the
-- private side is NULL. coaches.gender drops in Phase 3 migration 8;
-- coaches_private.gender is the canonical home post-refactor.
--
-- Idempotent: only updates rows where coaches_private.gender IS NULL,
-- so re-running is a no-op.
--
-- Limitation: only updates EXISTING coaches_private rows. Any coach
-- without a coaches_private row is skipped here. Phase 1B's
-- create-coach-account redirect ensures new coaches get all three
-- table rows via upsert_coach_full(). For existing-but-missing
-- coaches_private rows, that's flagged separately in §10 U5 (out of
-- scope for this migration; admin can backfill via the RPC if needed).

UPDATE public.coaches_private cpriv
SET gender = c.gender
FROM public.coaches c
WHERE cpriv.user_id = c.user_id
  AND cpriv.gender IS NULL
  AND c.gender IS NOT NULL;

DO $$
DECLARE
  v_missing_private INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_missing_private
  FROM public.coaches c
  LEFT JOIN public.coaches_private cpriv ON cpriv.user_id = c.user_id
  WHERE cpriv.user_id IS NULL;

  IF v_missing_private > 0 THEN
    RAISE WARNING 'After gender backfill: % coaches still without a coaches_private row', v_missing_private;
    RAISE WARNING 'Their gender (if any) on coaches.gender will be lost when Phase 3 drops that column.';
    RAISE WARNING 'Resolve via upsert_coach_full(...) before Phase 3 ships.';
  END IF;
END $$;
