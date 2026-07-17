-- ============================================================================
-- Exercise-library rebuild — STEP 0: additive schema
-- MUST run (and COMMIT) before migration_2_data.sql, because that migration
-- inserts rows with category = 'systemic' / 'powerlifting'. Postgres forbids
-- USING a newly-added enum value in the same transaction that added it, so the
-- ALTER TYPE ... ADD VALUE below has to land in its OWN migration/commit first.
-- Keep this as a standalone `db push` step; do not fold it into migration_2.
-- ============================================================================

-- New per-exercise descriptive columns (text; grip is a '/'-joined multiselect
-- string for now — revisit as text[] later if the pickers need structured grip).
ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS client_name  text;
ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS positioning  text;
ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS grip         text;
-- migration_2 also writes `laterality` (bi/uni), which your step-0 spec omitted and the table
-- does NOT have. Without this column the data load errors ("column laterality does not exist").
ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS laterality   text;

-- New categories for the two new regions. Enum type confirmed = `exercise_category`
-- (current values: strength, cardio, mobility, physio, warmup, cooldown, sport_specific).
-- IF NOT EXISTS makes this idempotent / re-runnable.
ALTER TYPE public.exercise_category ADD VALUE IF NOT EXISTS 'systemic';
ALTER TYPE public.exercise_category ADD VALUE IF NOT EXISTS 'powerlifting';
