-- P4 — role-shaped read of a client's food log for one day.
--
-- The distinctive rule (FOOD_LOGGING_PLAN §4.4): same log, three depths.
--   client / admin / dietitian → full, INCLUDING micronutrients.
--   coach                      → calories + macros ONLY. No micros.
--
-- ── Why this is an RPC, not RLS ──────────────────────────────────────────────
-- Row-level security is exactly that: row-level. The staff-read policies on
-- food_log_entries / food_log_daily_rollup already let a coach SELECT the row — and
-- that row carries the micros JSONB. RLS cannot hide a COLUMN from someone allowed to
-- read the row. So the macro/micro split has to be shaped in the payload, and this
-- function is the only place any app surface reads these tables staff-side.
--
-- The micro boundary is enforced by CONSTRUCTION, not by trust: the allowed-key set is
-- computed from nutrients.coach_visible, and every micros JSONB (per entry AND the day
-- roll-up) is rebuilt containing only those keys. A coach payload is therefore physically
-- incapable of holding sodium/sugar/etc. — there is no code path that copies a hidden key
-- into a coach's response.
--
-- coach_visible today: energy, protein, fat, carb, fibre = true; the 8 micros = false.
-- (Macros live in dedicated total_* columns; the micros JSONB holds fibre + the 8 micros.)

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
  -- Anon can never reach this. Defence-in-depth behind the REVOKE below.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- Access gate: self, admin, primary coach, team coach, or an active care-team member.
  IF NOT (
       v_uid = p_client_id
    OR public.is_admin(v_uid)
    OR public.is_primary_coach_for_user(v_uid, p_client_id)
    OR public.is_team_coach_for_client(v_uid, p_client_id)
    OR public.is_care_team_member_for_client(v_uid, p_client_id)
  ) THEN
    RAISE EXCEPTION 'not authorised to read this client''s nutrition' USING ERRCODE = '42501';
  END IF;

  -- Micro depth: the client themselves, an admin, or a dietitian FOR THIS CLIENT.
  -- A plain coach (care-team member but not dietitian) resolves to false → macros only.
  v_full := (
       v_uid = p_client_id
    OR public.is_admin(v_uid)
    OR public.is_dietitian_for_client(v_uid, p_client_id)
  );

  -- The keys this caller may see. Coach: coach_visible only (→ fibre). Full: every key.
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
    'target', (
      SELECT jsonb_build_object(
        'kcal',      g.daily_calories,
        'protein_g', g.protein_grams,
        'fat_g',     g.fat_grams,
        'carb_g',    g.carb_grams)
      FROM public.nutrition_goals g
      WHERE g.user_id = p_client_id AND g.is_active
      ORDER BY g.created_at DESC
      LIMIT 1
    ),
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
           -- Rebuilt from ONLY the allowed keys — a coach entry cannot carry a hidden one.
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

-- Mandatory REVOKE/GRANT (Supabase grants EXECUTE to anon+authenticated by default).
-- Authenticated only; the in-body auth.uid() gate is defence-in-depth, not the boundary.
REVOKE ALL ON FUNCTION public.get_client_daily_nutrition(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_daily_nutrition(UUID, DATE) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_client_daily_nutrition(UUID, DATE) TO authenticated;
