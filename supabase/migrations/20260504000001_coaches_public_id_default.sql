-- Coach refactor follow-up: coaches_public.id was NOT NULL with no default.
--
-- Pre-Phase-1, the only path that INSERTed into coaches_public was the
-- one-time backfill in migration 20260121190914 (which supplied id
-- explicitly via SELECT id FROM coaches). Coach self-service paths only
-- UPDATEd existing rows. The seed bug meant create-coach-account never
-- INSERTed at all — it skipped coaches_public entirely.
--
-- Phase 1A's upsert_coach_full(...) RPC INSERTs into coaches_public
-- without supplying id, expecting the table to default it. Discovered
-- in production smoke testing on May 4, 2026, when the first new-coach
-- creation post-Phase-1 returned:
--   "null value in column \"id\" of relation \"coaches_public\"
--    violates not-null constraint"
--
-- Fix: add gen_random_uuid() default. Matches coaches.id and
-- coaches_private.id which already have it.
--
-- Idempotent: ALTER ... SET DEFAULT is a no-op if already set.

ALTER TABLE public.coaches_public
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
