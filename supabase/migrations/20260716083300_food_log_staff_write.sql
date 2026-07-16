-- Staff food-log authoring — let a coach/dietitian ADD & CORRECT a client's entries.
--
-- P4 gave staff a read-only view (food_log staff read + get_client_daily_nutrition). This
-- completes the read→write loop: an ADDITIVE write policy gated by can_edit_nutrition. The
-- existing "food_log own" (client writes own) and "food_log staff read" policies are untouched;
-- RLS policies OR together, so this only widens who may write, never narrows it.
--
-- can_edit_nutrition already encodes the coach-vs-dietitian precedence: it returns FALSE for a
-- coach whose client has a dietitian assigned. So that precedence is enforced here server-side
-- by construction — there is no separate branch to keep in sync.

DROP POLICY IF EXISTS "food_log staff write" ON public.food_log_entries;
CREATE POLICY "food_log staff write" ON public.food_log_entries
  FOR ALL TO authenticated
  USING (public.can_edit_nutrition(auth.uid(), client_id))
  WITH CHECK (public.can_edit_nutrition(auth.uid(), client_id));

-- ---------------------------------------------------------------------------
-- get_client_daily_nutrition — expose `food_id` + `created_by_role` on each entry.
--
--   * created_by_role: the staff surface renders an attribution chip ("added by coach/
--     dietitian") on every entry, on BOTH the coach view and the client's own diary. A client
--     must never find a staff-inserted entry indistinguishable from one they logged themselves.
--   * food_id: lets a staff edit recover the food's real per-100g micros when re-portioning,
--     instead of dropping them.
--
-- Byte-identical to 20260715170000 otherwise (target coalesce, micro boundary, grants).
-- ---------------------------------------------------------------------------
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
    'target', COALESCE(
      (SELECT jsonb_build_object(
         'kcal',      p.daily_calories,
         'protein_g', p.protein_grams,
         'fat_g',     p.fat_grams,
         'carb_g',    p.carb_grams)
       FROM public.nutrition_phases p
       WHERE p.user_id = p_client_id AND p.is_active
         AND p.daily_calories IS NOT NULL AND p.daily_calories > 0
       ORDER BY p.created_at DESC
       LIMIT 1),
      (SELECT jsonb_build_object(
         'kcal',      g.daily_calories,
         'protein_g', g.protein_grams,
         'fat_g',     g.fat_grams,
         'carb_g',    g.carb_grams)
       FROM public.nutrition_goals g
       WHERE g.user_id = p_client_id AND g.is_active
         AND g.daily_calories IS NOT NULL AND g.daily_calories > 0
       ORDER BY g.created_at DESC
       LIMIT 1)
    ),
    'entries', COALESCE(
      (SELECT jsonb_agg(
         jsonb_build_object(
           'id',              e.id,
           'food_id',         e.food_id,
           'meal_slot',       e.meal_slot,
           'food_name',       e.food_name,
           'quantity',        e.quantity,
           'unit',            e.unit,
           'quantity_g',      e.quantity_g,
           'kcal',            e.kcal,
           'protein_g',       e.protein_g,
           'fat_g',           e.fat_g,
           'carb_g',          e.carb_g,
           'portion_label',   e.source_note,
           'created_by_role', e.created_by_role,
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

-- Grants are unchanged by CREATE OR REPLACE, but restated for the mandatory pattern.
REVOKE ALL ON FUNCTION public.get_client_daily_nutrition(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_daily_nutrition(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_client_daily_nutrition(UUID, DATE) TO authenticated;
