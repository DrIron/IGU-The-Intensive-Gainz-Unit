-- Backfill nutrition_phases.coach_id for legacy phases created before the
-- CoachNutritionGoal insert began stamping coach_id (and phases detached by the
-- delete-account coach-nulling path). Weight-change testimonial proof (T3) offers
-- only phases where coach_id = the reviewed coach, so NULL-coach phases are
-- invisible to the picker.
--
-- Derivation: the client's coach from their subscriptions, but ONLY when it is
-- UNAMBIGUOUS — the client has exactly one distinct subscription coach. This
-- avoids mis-crediting a phase to the wrong coach for clients who changed coaches
-- (which would violate the Gap-2 honesty guardrail). Ambiguous / no-subscription
-- clients keep NULL (rare; can be resolved manually if ever needed).

WITH single_coach_clients AS (
  SELECT s.user_id, (array_agg(DISTINCT s.coach_id))[1] AS coach_id
  FROM public.subscriptions s
  WHERE s.coach_id IS NOT NULL
  GROUP BY s.user_id
  HAVING count(DISTINCT s.coach_id) = 1
)
UPDATE public.nutrition_phases np
SET coach_id = scc.coach_id,
    updated_at = now()
FROM single_coach_clients scc
WHERE np.coach_id IS NULL
  AND np.user_id = scc.user_id;
