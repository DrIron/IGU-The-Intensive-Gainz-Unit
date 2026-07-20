-- Fix 3: rich swap/replacement matching — weighted, graded, ranked (not hard-filtered).
-- Replaces the binary is_match prefilter in get_substitute_exercises with a weighted score.
-- v1 ranks strength/powerlifting movement on the TEXT movement_pattern (movement_pattern_id is
-- only ~7% populated on the active set; switch to the FK in a follow-up after backfill).
-- Non-breaking: keeps all existing return fields + the legacy `match` ("exact"|"close"),
-- derived as exact <= tier 'best', for one release until the frontend consumes match_tier.
-- Signature, SECURITY DEFINER, and the is_global OR created_by_coach_id = auth.uid() scope are unchanged.

CREATE OR REPLACE FUNCTION public.get_substitute_exercises(
  p_exercise_id uuid,
  p_available_equipment text[] DEFAULT NULL::text[],
  p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_src    public.exercise_library%ROWTYPE;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.exercise_library WHERE id = p_exercise_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'exercise_not_found');
  END IF;

  WITH candidates AS (
    SELECT el.*,
      -- ANCHOR: minimal shared attribute to stay on-topic (else excluded).
      CASE
        WHEN v_src.category = 'strength' THEN el.muscle_id IS NOT DISTINCT FROM v_src.muscle_id
        WHEN v_src.category = 'cardio' THEN true
        WHEN v_src.category IN ('mobility', 'warmup', 'cooldown') THEN
          el.target_region_id IS NOT DISTINCT FROM v_src.target_region_id
        WHEN v_src.category = 'physio' THEN
          el.physio_purpose_id IS NOT DISTINCT FROM v_src.physio_purpose_id
          AND (v_src.target_region_id IS NULL
               OR el.target_region_id IS NOT DISTINCT FROM v_src.target_region_id)
        WHEN v_src.category IN ('systemic', 'powerlifting') THEN true  -- category-level anchor
        ELSE false
      END AS is_anchor
    FROM public.exercise_library el
    WHERE el.id <> v_src.id
      AND el.is_active
      AND el.category = v_src.category
      AND (el.is_global OR el.created_by_coach_id = auth.uid())
  ),
  scored AS (
    SELECT c.*,
      (c.subdivision_id     IS NOT DISTINCT FROM v_src.subdivision_id)     AS d_subdiv,
      (c.movement_pattern   IS NOT DISTINCT FROM v_src.movement_pattern)   AS d_move,   -- TEXT (v1)
      (c.cardio_movement_id IS NOT DISTINCT FROM v_src.cardio_movement_id) AS d_cardio,
      (c.technique_id       IS NOT DISTINCT FROM v_src.technique_id)       AS d_tech,
      (c.target_region_id   IS NOT DISTINCT FROM v_src.target_region_id)   AS d_region,
      (c.laterality         IS NOT DISTINCT FROM v_src.laterality)         AS d_lat,
      (c.equipment          IS NOT DISTINCT FROM v_src.equipment)          AS d_equip,
      LEAST(2, COALESCE((
        SELECT count(*) FROM unnest(c.resistance_profiles) rp
        WHERE rp = ANY(v_src.resistance_profiles)
      ), 0))::int AS shared_resist,
      CASE WHEN p_available_equipment IS NOT NULL
                AND c.equipment = ANY(p_available_equipment) THEN 1 ELSE 0 END AS equip_boost
    FROM candidates c
    WHERE c.is_anchor
  ),
  ranked AS (
    SELECT s.*,
      (
        CASE
          WHEN v_src.category = 'strength' THEN
              (CASE WHEN s.d_subdiv THEN 3   ELSE 0 END)
            + (CASE WHEN s.d_move   THEN 2   ELSE 0 END)
            + s.shared_resist
            + (CASE WHEN s.d_equip  THEN 1   ELSE 0 END)
            + (CASE WHEN s.d_lat    THEN 0.5 ELSE 0 END)
          WHEN v_src.category = 'cardio' THEN
              (CASE WHEN s.d_cardio THEN 3 ELSE 0 END)
            + (CASE WHEN s.d_equip  THEN 1 ELSE 0 END)
          WHEN v_src.category IN ('mobility', 'warmup', 'cooldown') THEN
              (CASE WHEN s.d_tech  THEN 3 ELSE 0 END)
            + (CASE WHEN s.d_equip THEN 1 ELSE 0 END)
          WHEN v_src.category = 'physio' THEN
              (CASE WHEN s.d_region THEN 2 ELSE 0 END)
            + (CASE WHEN s.d_equip  THEN 1 ELSE 0 END)
          WHEN v_src.category = 'systemic' THEN
              (CASE WHEN s.d_move  THEN 2 ELSE 0 END)   -- same complex type (Carry/Thruster/…)
            + s.shared_resist
            + (CASE WHEN s.d_equip THEN 1 ELSE 0 END)
          WHEN v_src.category = 'powerlifting' THEN
              (CASE WHEN s.d_move  THEN 2 ELSE 0 END)   -- same comp lift
            + (CASE WHEN s.d_equip THEN 1 ELSE 0 END)
          ELSE 0
        END
      )::numeric AS match_score,
      (
          ARRAY[]::text[]
        || CASE WHEN v_src.category = 'strength' AND s.d_subdiv THEN ARRAY['subdivision'] ELSE ARRAY[]::text[] END
        || CASE WHEN v_src.category IN ('strength','powerlifting','systemic') AND s.d_move THEN ARRAY['movement_pattern'] ELSE ARRAY[]::text[] END
        || CASE WHEN v_src.category IN ('strength','systemic') AND s.shared_resist > 0 THEN ARRAY['resistance'] ELSE ARRAY[]::text[] END
        || CASE WHEN v_src.category = 'cardio' AND s.d_cardio THEN ARRAY['cardio_movement'] ELSE ARRAY[]::text[] END
        || CASE WHEN v_src.category IN ('mobility','warmup','cooldown') AND s.d_tech THEN ARRAY['technique'] ELSE ARRAY[]::text[] END
        || CASE WHEN v_src.category = 'physio' AND s.d_region THEN ARRAY['target_region'] ELSE ARRAY[]::text[] END
        || CASE WHEN v_src.category = 'strength' AND s.d_lat THEN ARRAY['laterality'] ELSE ARRAY[]::text[] END
        || CASE WHEN s.d_equip THEN ARRAY['equipment'] ELSE ARRAY[]::text[] END
      ) AS matched_dimensions
    FROM scored s
  ),
  tiered AS (
    SELECT r.*,
      CASE
        WHEN v_src.category = 'strength' THEN
          CASE WHEN r.d_subdiv AND r.d_move THEN 'best'
               WHEN r.d_subdiv OR  r.d_move THEN 'strong'
               ELSE 'partial' END
        WHEN v_src.category = 'cardio' THEN
          CASE WHEN r.d_cardio THEN 'best' WHEN r.d_equip THEN 'strong' ELSE 'partial' END
        WHEN v_src.category IN ('mobility','warmup','cooldown') THEN
          CASE WHEN r.d_tech THEN 'best' WHEN r.d_equip THEN 'strong' ELSE 'partial' END
        WHEN v_src.category = 'physio' THEN
          CASE WHEN r.d_region THEN 'best' WHEN r.d_equip THEN 'strong' ELSE 'partial' END
        WHEN v_src.category = 'systemic' THEN
          CASE WHEN r.d_move THEN 'best'
               WHEN r.shared_resist > 0 OR r.d_equip THEN 'strong'
               ELSE 'partial' END
        WHEN v_src.category = 'powerlifting' THEN
          CASE WHEN r.d_move THEN 'best' WHEN r.d_equip THEN 'strong' ELSE 'partial' END
        ELSE 'partial'
      END AS match_tier
    FROM ranked r
  )
  SELECT jsonb_build_object(
    'source', jsonb_build_object('id', v_src.id, 'name', v_src.name, 'category', v_src.category),
    'substitutes', COALESCE((
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT t.id, t.name, t.equipment, t.primary_muscle,
               t.resistance_profiles, t.cardio_movement_id, t.technique_id, t.target_region_id,
               t.muscle_id, t.subdivision_id, t.movement_pattern_id,
               t.match_score, t.match_tier, t.matched_dimensions,
               CASE WHEN t.match_tier = 'best' THEN 'exact' ELSE 'close' END AS match  -- legacy, keep 1 release
        FROM tiered t
        ORDER BY t.match_score DESC, t.equip_boost DESC, t.name
        LIMIT GREATEST(p_limit, 1)
      ) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
