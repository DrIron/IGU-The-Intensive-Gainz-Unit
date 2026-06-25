-- Unified weekly check-in: replace the two boolean adherence answers with a
-- 3-level scale (client UX), while keeping the booleans as a derived
-- compatibility shadow so coach-facing math (get_coach_roster_stats RPC,
-- nutritionCalculations adherence rate) keeps working unchanged.
--
-- calorie_adherence : on_point | mostly | off_track
-- tracking_accuracy : weighed  | estimated | guessed
--
-- The frontend dual-writes the scale AND the legacy booleans (lenient map:
-- middle rung -> true). This migration is additive + idempotent.

ALTER TABLE public.adherence_logs
  ADD COLUMN IF NOT EXISTS calorie_adherence TEXT,
  ADD COLUMN IF NOT EXISTS tracking_accuracy TEXT;

ALTER TABLE public.adherence_logs
  DROP CONSTRAINT IF EXISTS adherence_logs_calorie_adherence_check;
ALTER TABLE public.adherence_logs
  ADD CONSTRAINT adherence_logs_calorie_adherence_check
  CHECK (calorie_adherence IS NULL OR calorie_adherence IN ('on_point', 'mostly', 'off_track'));

ALTER TABLE public.adherence_logs
  DROP CONSTRAINT IF EXISTS adherence_logs_tracking_accuracy_check;
ALTER TABLE public.adherence_logs
  ADD CONSTRAINT adherence_logs_tracking_accuracy_check
  CHECK (tracking_accuracy IS NULL OR tracking_accuracy IN ('weighed', 'estimated', 'guessed'));

UPDATE public.adherence_logs
  SET calorie_adherence = CASE WHEN followed_calories THEN 'on_point' ELSE 'off_track' END
  WHERE calorie_adherence IS NULL;

UPDATE public.adherence_logs
  SET tracking_accuracy = CASE WHEN tracked_accurately THEN 'weighed' ELSE 'guessed' END
  WHERE tracking_accuracy IS NULL;
