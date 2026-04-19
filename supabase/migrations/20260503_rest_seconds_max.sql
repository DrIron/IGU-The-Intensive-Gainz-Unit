-- Rest periods become a range (min..max) instead of a single value.
-- `rest_seconds` stays as the lower bound (keeps existing data intact).
-- New `rest_seconds_max` optional upper bound; when null, UI treats rest as
-- a single value (backward compat).
--
-- The app auto-swaps min/max on input when min > max, so a DB-level check
-- would just produce spurious errors during edits. Instead we validate
-- non-negative and let the app enforce ordering at write time.

ALTER TABLE public.exercise_prescriptions
  ADD COLUMN IF NOT EXISTS rest_seconds_max INT CHECK (rest_seconds_max >= 0);

COMMENT ON COLUMN public.exercise_prescriptions.rest_seconds IS
  'Lower bound of the rest range in seconds. When rest_seconds_max is null, treated as a single rest value.';
COMMENT ON COLUMN public.exercise_prescriptions.rest_seconds_max IS
  'Upper bound of the rest range in seconds. Null means coach used a single rest value (see rest_seconds).';
