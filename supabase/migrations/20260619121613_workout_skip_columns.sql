-- Skip support for the workout logger, recorded so coach adherence is accurate.
-- Three levels:
--   * workout/day  -> client_day_modules.status = 'skipped' (enum value already
--                     exists) + skipped_at timestamp (set via skip_client_day_module RPC)
--   * exercise     -> client_module_exercises.skipped flag (set via skip_client_exercise RPC)
--   * single set   -> exercise_set_logs.skipped flag (client writes directly via
--                     the existing INSERT/UPDATE RLS; a skipped set is a row with
--                     skipped = true and null performed_* values)

ALTER TABLE public.client_day_modules
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz;

ALTER TABLE public.client_module_exercises
  ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false;

ALTER TABLE public.client_module_exercises
  ADD COLUMN IF NOT EXISTS skipped_at timestamptz;

ALTER TABLE public.exercise_set_logs
  ADD COLUMN IF NOT EXISTS skipped boolean NOT NULL DEFAULT false;
