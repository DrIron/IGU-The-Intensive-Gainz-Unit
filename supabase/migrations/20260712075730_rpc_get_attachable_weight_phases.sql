-- T3.1 Migration B — attachable weight-change phases for the caller, scoped to a
-- specific coach. Returns the CALLER's own nutrition phases where coach_id =
-- p_coach_user_id, each with a server-computed weight-change preview from
-- weight_logs (start = earliest log, end = latest, delta, weeks from log span).
-- Phases with <2 logs are omitted (no computable delta). authenticated-only.
-- The coach_id = p_coach_user_id filter is the Gap-2 guardrail by construction.

CREATE OR REPLACE FUNCTION public.get_attachable_weight_phases(p_coach_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH phase_logs AS (
    SELECT
      np.id           AS phase_id,
      np.phase_name   AS phase_name,
      np.goal_type    AS goal_type,
      min(wl.log_date) AS from_date,
      max(wl.log_date) AS to_date,
      count(*)         AS n,
      round(((array_agg(wl.weight_kg ORDER BY wl.log_date ASC))[1])::numeric, 1)  AS start_kg,
      round(((array_agg(wl.weight_kg ORDER BY wl.log_date DESC))[1])::numeric, 1) AS end_kg
    FROM public.nutrition_phases np
    JOIN public.weight_logs wl ON wl.phase_id = np.id
    WHERE np.user_id = auth.uid()
      AND np.coach_id = p_coach_user_id
    GROUP BY np.id, np.phase_name, np.goal_type
    HAVING count(*) >= 2
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'phase_id',   phase_id,
      'phase_name', phase_name,
      'goal_type',  goal_type,
      'start_kg',   start_kg,
      'end_kg',     end_kg,
      'delta_kg',   round((end_kg - start_kg)::numeric, 1),
      'weeks',      GREATEST(1, round((to_date - from_date)::numeric / 7))::int,
      'from_date',  from_date,
      'to_date',    to_date
    )
    ORDER BY to_date DESC
  ), '[]'::jsonb)
  FROM phase_logs;
$$;

REVOKE ALL ON FUNCTION public.get_attachable_weight_phases(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_attachable_weight_phases(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_attachable_weight_phases(uuid) TO authenticated;
