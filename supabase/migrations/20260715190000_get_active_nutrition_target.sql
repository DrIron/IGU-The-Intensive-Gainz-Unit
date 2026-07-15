-- Extract the phase-first-then-goals target coalesce into ONE SQL function, matching the TS
-- getActiveNutritionTarget. This is the SQL half of the #215 de-duplication: the same coalesce
-- was inlined in get_client_daily_nutrition's `target` subquery; now both share this.
--
-- Behaviour is byte-identical to that subquery: active phase first, else active goal;
-- created_at DESC LIMIT 1; only a real positive daily_calories; same {kcal, protein_g, fat_g,
-- carb_g} JSON shape, or NULL.

CREATE OR REPLACE FUNCTION public.get_active_nutrition_target(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'kcal',      p.daily_calories,
       'protein_g', p.protein_grams,
       'fat_g',     p.fat_grams,
       'carb_g',    p.carb_grams)
     FROM public.nutrition_phases p
     WHERE p.user_id = p_user_id AND p.is_active
       AND p.daily_calories IS NOT NULL AND p.daily_calories > 0
     ORDER BY p.created_at DESC
     LIMIT 1),
    (SELECT jsonb_build_object(
       'kcal',      g.daily_calories,
       'protein_g', g.protein_grams,
       'fat_g',     g.fat_grams,
       'carb_g',    g.carb_grams)
     FROM public.nutrition_goals g
     WHERE g.user_id = p_user_id AND g.is_active
       AND g.daily_calories IS NOT NULL AND g.daily_calories > 0
     ORDER BY g.created_at DESC
     LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.get_active_nutrition_target(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_active_nutrition_target(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_active_nutrition_target(UUID) TO authenticated, service_role;

-- Swap get_client_daily_nutrition's inline target subquery for the shared function. Nothing
-- else in the RPC changes.
CREATE OR REPLACE FUNCTION public.get_client_daily_nutrition(
  p_client_id UUID,
  p_log_date  DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_full        BOOLEAN;
  v_allowed     TEXT[];
  v_result      JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT (
       v_uid = p_client_id
    OR public.is_admin(v_uid)
    OR public.is_primary_coach_for_user(v_uid, p_client_id)
    OR public.is_team_coach_for_client(v_uid, p_client_id)
    OR public.is_care_team_member_for_client(v_uid, p_client_id)
  ) THEN
    RAISE EXCEPTION 'not authorised to read this client''s nutrition' USING ERRCODE = '42501';
  END IF;

  v_full := (
       v_uid = p_client_id
    OR public.is_admin(v_uid)
    OR public.is_dietitian_for_client(v_uid, p_client_id)
  );

  SELECT array_agg(key) INTO v_allowed
  FROM public.nutrients
  WHERE coach_visible OR v_full;

  SELECT jsonb_build_object(
    'log_date', p_log_date,
    'micros_included', v_full,
    'totals', COALESCE(
      (SELECT jsonb_build_object(
         'kcal',      r.total_kcal,
         'protein_g', r.total_protein_g,
         'fat_g',     r.total_fat_g,
         'carb_g',    r.total_carb_g)
       FROM public.food_log_daily_rollup r
       WHERE r.client_id = p_client_id AND r.log_date = p_log_date),
      jsonb_build_object('kcal', 0, 'protein_g', 0, 'fat_g', 0, 'carb_g', 0)
    ),
    -- Shared coalesce (phase-first, then goal). Same shape the inline subquery returned.
    'target', public.get_active_nutrition_target(p_client_id),
    'entries', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'id',            e.id,
           'meal_slot',     e.meal_slot,
           'food_name',     e.food_name,
           'quantity',      e.quantity,
           'unit',          e.unit,
           'quantity_g',    e.quantity_g,
           'kcal',          e.kcal,
           'protein_g',     e.protein_g,
           'fat_g',         e.fat_g,
           'carb_g',        e.carb_g,
           'portion_label', e.source_note,
           'micros', COALESCE(
             (SELECT jsonb_object_agg(m.key, m.value)
              FROM jsonb_each(e.micros) AS m(key, value)
              WHERE m.key = ANY(v_allowed)),
             '{}'::jsonb)
         ) ORDER BY e.logged_at)
       FROM public.food_log_entries e
       WHERE e.client_id = p_client_id AND e.log_date = p_log_date),
      '[]'::jsonb
    ),
    'day_micros', COALESCE(
      (SELECT jsonb_object_agg(m.key, m.value)
       FROM public.food_log_daily_rollup r,
            jsonb_each(r.micros) AS m(key, value)
       WHERE r.client_id = p_client_id AND r.log_date = p_log_date
         AND m.key = ANY(v_allowed)),
      '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_daily_nutrition(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_daily_nutrition(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_client_daily_nutrition(UUID, DATE) TO authenticated;
