-- Roster real-adherence — logged-intake adherence alongside self-report (behind a FE flag).
--
-- ADDITIVE + zero risk to the load-bearing roster: get_coach_roster_stats is NOT touched, so its
-- self-report adherence_pct is byte-identical. This adds a separate, opt-in RPC that computes
-- adherence from what clients actually LOGGED (food_log_daily_rollup) against their coach target.

-- 1) Extend the shared target coalesce to also expose tolerance_pct (mirrors the TS
--    getActiveNutritionTarget, which already returns tolerancePct). Phase carries its own
--    adherence_tolerance_pct; goals (team-plan self-service) fall back to the default 10.
--    Additive: get_client_daily_nutrition reads only kcal/macros, so the extra key is ignored.
CREATE OR REPLACE FUNCTION public.get_active_nutrition_target(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
       'kcal',          p.daily_calories,
       'protein_g',     p.protein_grams,
       'fat_g',         p.fat_grams,
       'carb_g',        p.carb_grams,
       'tolerance_pct', COALESCE(p.adherence_tolerance_pct, 10))
     FROM public.nutrition_phases p
     WHERE p.user_id = p_user_id AND p.is_active
       AND p.daily_calories IS NOT NULL AND p.daily_calories > 0
     ORDER BY p.created_at DESC
     LIMIT 1),
    (SELECT jsonb_build_object(
       'kcal',          g.daily_calories,
       'protein_g',     g.protein_grams,
       'fat_g',         g.fat_grams,
       'carb_g',        g.carb_grams,
       'tolerance_pct', 10)
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

-- 2) The new opt-in RPC. Same roster scope as get_coach_roster_stats (the caller coach's active
--    subscriptions incl. their coach_teams). For each client, over the last 28 days of
--    food_log_daily_rollup: logged_days = rows present; a day is adherent when
--    |total_kcal − target.kcal| / target.kcal <= tolerance. Honesty gate (same as
--    evaluate_loud_macro_alert): logged_days < 4 OR no target => logged_adherence_pct = null.
--
--    SIMPLIFICATION (noted): uses the CURRENT active target across the whole window (consistent
--    with the P5a card), not a per-day phase-in-effect target — deferred.
CREATE OR REPLACE FUNCTION public.get_coach_roster_logged_adherence()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach    UUID := auth.uid();
  v_team_ids UUID[];
  v_from     DATE;
  v_result   JSONB;
BEGIN
  IF v_coach IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT array_agg(id) INTO v_team_ids FROM public.coach_teams WHERE coach_id = v_coach;

  -- Last 28 days inclusive, anchored to the Kuwait wall-clock date (matches roster date math).
  v_from := ((now() AT TIME ZONE 'Asia/Kuwait')::date) - 27;

  WITH roster AS (
    SELECT DISTINCT ON (s.user_id) s.user_id
    FROM public.subscriptions s
    JOIN public.profiles_public pp ON pp.id = s.user_id
    WHERE (s.coach_id = v_coach OR (v_team_ids IS NOT NULL AND s.team_id = ANY (v_team_ids)))
      AND s.status = 'active'
      AND pp.status = 'active'
    ORDER BY s.user_id, s.created_at DESC
  ),
  tgt AS (
    SELECT r.user_id, public.get_active_nutrition_target(r.user_id) AS target
    FROM roster r
  ),
  logged AS (
    SELECT
      rl.client_id AS user_id,
      COUNT(*) AS logged_days,
      COUNT(*) FILTER (
        WHERE (t.target->>'kcal') IS NOT NULL
          AND (t.target->>'kcal')::numeric > 0
          AND abs(rl.total_kcal - (t.target->>'kcal')::numeric) / (t.target->>'kcal')::numeric
              <= COALESCE((t.target->>'tolerance_pct')::numeric, 10) / 100.0
      ) AS adherent_days
    FROM public.food_log_daily_rollup rl
    JOIN tgt t ON t.user_id = rl.client_id
    WHERE rl.log_date >= v_from
    GROUP BY rl.client_id
  )
  SELECT COALESCE(jsonb_object_agg(
    r.user_id,
    jsonb_build_object(
      'logged_days', COALESCE(l.logged_days, 0),
      'logged_adherence_pct',
        CASE
          WHEN COALESCE(l.logged_days, 0) >= 4
           AND (tt.target->>'kcal') IS NOT NULL
           AND (tt.target->>'kcal')::numeric > 0
          THEN ROUND(100.0 * l.adherent_days / l.logged_days)::int
          ELSE NULL
        END
    )
  ), '{}'::jsonb)
  INTO v_result
  FROM roster r
  LEFT JOIN logged l ON l.user_id = r.user_id
  LEFT JOIN tgt tt ON tt.user_id = r.user_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_coach_roster_logged_adherence() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_roster_logged_adherence() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_roster_logged_adherence() TO authenticated;
