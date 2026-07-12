-- T3.1 Migration B — attach a coach-scoped weight-change proof to the caller's
-- own testimonial. Snapshot recomputed server-side from weight_logs (client never
-- passes the numbers). Guards (RAISE on any fail): own testimonial, own phase,
-- and phase.coach_id = testimonial.coach_id (Gap-2 — never credit coach A for
-- results under coach B). authenticated-only.

CREATE OR REPLACE FUNCTION public.attach_weight_change(p_testimonial_id uuid, p_phase_id uuid, p_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_testimonial_coach uuid;
  v_phase_user uuid;
  v_phase_coach uuid;
  v_snapshot jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT coach_id INTO v_testimonial_coach
  FROM public.testimonials
  WHERE id = p_testimonial_id AND user_id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized for this testimonial';
  END IF;

  SELECT user_id, coach_id INTO v_phase_user, v_phase_coach
  FROM public.nutrition_phases
  WHERE id = p_phase_id;
  IF NOT FOUND OR v_phase_user IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Not authorized for this phase';
  END IF;

  -- Gap-2: the proof phase must belong to the coach being reviewed.
  IF v_phase_coach IS DISTINCT FROM v_testimonial_coach THEN
    RAISE EXCEPTION 'Phase coach does not match the reviewed coach';
  END IF;

  IF p_note IS NOT NULL AND char_length(p_note) > 280 THEN
    RAISE EXCEPTION 'Note too long (max 280)';
  END IF;

  WITH agg AS (
    SELECT
      np.phase_name    AS phase_name,
      np.goal_type     AS goal_type,
      min(wl.log_date) AS from_date,
      max(wl.log_date) AS to_date,
      count(*)         AS n,
      round(((array_agg(wl.weight_kg ORDER BY wl.log_date ASC))[1])::numeric, 1)  AS start_kg,
      round(((array_agg(wl.weight_kg ORDER BY wl.log_date DESC))[1])::numeric, 1) AS end_kg
    FROM public.nutrition_phases np
    JOIN public.weight_logs wl ON wl.phase_id = np.id
    WHERE np.id = p_phase_id
    GROUP BY np.id, np.phase_name, np.goal_type
  )
  SELECT jsonb_build_object(
    'phase_id',   p_phase_id,
    'phase_name', phase_name,
    'goal_type',  goal_type,
    'start_kg',   start_kg,
    'end_kg',     end_kg,
    'delta_kg',   round((end_kg - start_kg)::numeric, 1),
    'weeks',      GREATEST(1, round((to_date - from_date)::numeric / 7))::int,
    'from_date',  from_date,
    'to_date',    to_date
  ) INTO v_snapshot
  FROM agg
  WHERE n >= 2;

  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Phase has too few weight logs to compute a change';
  END IF;

  UPDATE public.testimonials
     SET attachment_type = 'weight_change',
         attachment = v_snapshot,
         attachment_note = p_note,
         updated_at = now()
   WHERE id = p_testimonial_id;

  RETURN v_snapshot;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_weight_change(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_weight_change(uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.attach_weight_change(uuid, uuid, text) TO authenticated;
