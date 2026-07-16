-- Coach-overridable adherence tolerance (D7 hybrid follow-up).
--
-- The food-log adherence band was a hard-coded ±10% adherent / ±20% slightly-off. This makes it
-- per-phase configurable: a coach can run a strict cut or a relaxed maintenance on the same
-- client without editing code. Defaults preserve today's behavior EXACTLY — every existing phase
-- backfills to 10 via the column default, so ±10/±20 is unchanged for all current data.
--
-- Team-plan (goals) clients deliberately get NO such column: their band falls back to the 10
-- default in the pure adherence module. Alert sensitivity (the macro-alert p_tolerance) is a
-- separate knob and is untouched here.

ALTER TABLE public.nutrition_phases
  ADD COLUMN IF NOT EXISTS adherence_tolerance_pct numeric NOT NULL DEFAULT 10
    CHECK (adherence_tolerance_pct > 0);

COMMENT ON COLUMN public.nutrition_phases.adherence_tolerance_pct IS
  'Calorie-adherence band half-width, in % of the daily target. A day is adherent within '
  '±tolerance, slightly-off within ±2·tolerance, else off-track. Default 10 reproduces the '
  'original ±10/±20 behavior.';
