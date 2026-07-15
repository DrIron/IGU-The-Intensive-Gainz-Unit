-- P5c — the loud macro-alert detector.
--
-- Acts on the adherence signal, so the honesty gate is load-bearing: it MUST NOT alert off
-- sparse data. An alert is louder than a dot, and a coach nudged about a client who only
-- logged twice this week — off two atypical days — would be noise that erodes trust in every
-- future alert. So: fires only over a 7-day rolling average with ≥ p_min_logged logged days,
-- and unlogged days are excluded from every average (they are absence, not zeros).
--
-- LOUD tier only (this slice): calories both sides, protein UNDER side only. High protein is
-- never flagged — eating more protein than target is not a problem to alert a coach about.
-- Fat/carb (quiet tier) and any client-facing nudge are deferred.

CREATE OR REPLACE FUNCTION public.evaluate_loud_macro_alert(
  p_client_id  UUID,
  p_end_date   DATE,
  p_tolerance  NUMERIC DEFAULT 0.15,
  p_min_logged INT     DEFAULT 4
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_target     JSONB;
  v_target_kcal    NUMERIC;
  v_target_prot    NUMERIC;
  v_logged     INT;
  v_avg_kcal   NUMERIC;
  v_avg_prot   NUMERIC;
  v_cal_dev    NUMERIC;
  v_prot_dev   NUMERIC;
  v_reasons    TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Access: the cron calls this with the service role, where auth.uid() IS NULL — allow that.
  -- Do NOT add a "uid IS NULL -> raise" guard: it would break the cron. For a real signed-in
  -- caller, require a relationship to the client.
  IF v_uid IS NOT NULL AND NOT (
       v_uid = p_client_id
    OR public.is_admin(v_uid)
    OR public.is_primary_coach_for_user(v_uid, p_client_id)
    OR public.is_team_coach_for_client(v_uid, p_client_id)
    OR public.is_care_team_member_for_client(v_uid, p_client_id)
  ) THEN
    RAISE EXCEPTION 'not authorised to evaluate this client''s macro alert' USING ERRCODE = '42501';
  END IF;

  v_target := public.get_active_nutrition_target(p_client_id);
  v_target_kcal := NULLIF((v_target->>'kcal')::numeric, 0);
  v_target_prot := NULLIF((v_target->>'protein_g')::numeric, 0);

  -- Logged days + averages over the trailing 7-day window. A rollup row present = a logged day.
  SELECT count(*), avg(total_kcal), avg(total_protein_g)
    INTO v_logged, v_avg_kcal, v_avg_prot
  FROM public.food_log_daily_rollup
  WHERE client_id = p_client_id
    AND log_date > p_end_date - 7   -- 7 days: p_end_date-6 .. p_end_date
    AND log_date <= p_end_date;

  -- The honesty gate. Too few logged days, or no target to measure against → never fire.
  IF v_logged < p_min_logged OR v_target_kcal IS NULL THEN
    RETURN jsonb_build_object(
      'fires', false,
      'reasons', ARRAY[]::TEXT[],
      'logged_days', v_logged,
      'calorie_deviation_pct', NULL,
      'protein_deviation_pct', NULL,
      'insufficient_data', true
    );
  END IF;

  v_cal_dev := (v_avg_kcal - v_target_kcal) / v_target_kcal;
  IF v_target_prot IS NOT NULL THEN
    v_prot_dev := (v_avg_prot - v_target_prot) / v_target_prot;
  END IF;

  IF v_cal_dev >  p_tolerance THEN v_reasons := array_append(v_reasons, 'calories_high'); END IF;
  IF v_cal_dev < -p_tolerance THEN v_reasons := array_append(v_reasons, 'calories_low');  END IF;
  -- Protein: UNDER side only. Never flag high protein.
  IF v_prot_dev IS NOT NULL AND v_prot_dev < -p_tolerance THEN v_reasons := array_append(v_reasons, 'protein_low'); END IF;

  RETURN jsonb_build_object(
    'fires', array_length(v_reasons, 1) IS NOT NULL,
    'reasons', v_reasons,
    'logged_days', v_logged,
    'calorie_deviation_pct', round(v_cal_dev * 100, 1),
    'protein_deviation_pct', CASE WHEN v_prot_dev IS NULL THEN NULL ELSE round(v_prot_dev * 100, 1) END,
    'insufficient_data', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_loud_macro_alert(UUID, DATE, NUMERIC, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.evaluate_loud_macro_alert(UUID, DATE, NUMERIC, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.evaluate_loud_macro_alert(UUID, DATE, NUMERIC, INT) TO authenticated, service_role;

-- Register the coach macro-alert email type (default-enabled), so admins can toggle it and
-- isEmailEnabled('macro_alert_coach') resolves a real row.
INSERT INTO public.email_types (id, label, category, is_enabled, sort_order, description, edge_function)
VALUES (
  'macro_alert_coach', 'Macro Check-in Alert', 'admin_alert', true, 55,
  'Notifies a coach when a client''s 7-day average calories or protein drift past tolerance (loud tier).',
  'process-macro-alerts'
)
ON CONFLICT (id) DO NOTHING;
