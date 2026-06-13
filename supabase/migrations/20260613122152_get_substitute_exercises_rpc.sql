-- Exercise Library Redesign — Phase 4: substitute-exercise engine.
-- See docs/EXERCISE_LIBRARY_REDESIGN.md.
--
-- Returns interchangeable exercises for a given exercise, using a category-specific
-- equivalence key (the taxonomy tree IS the matching rule):
--   strength            -> same muscle + subdivision + movement pattern (equipment varies);
--                          'exact' if resistance profile overlaps, else 'close'
--   cardio              -> any other cardio; 'exact' if same movement family
--   mobility/warmup/cooldown -> same target region; 'exact' if same technique
--   physio              -> same purpose (+ region if the source has one)
-- Optional p_available_equipment boosts substitutes the client/gym actually has.
--
-- One CREATE FUNCTION per file (CLI dollar-quote-splitter safety, see memory).
-- GRANT/REVOKE live in the sibling 20260613122153 migration.

CREATE OR REPLACE FUNCTION public.get_substitute_exercises(
  p_exercise_id uuid,
  p_available_equipment text[] DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_src    public.exercise_library%ROWTYPE;
  v_result jsonb;
BEGIN
  -- Called from the frontend by coaches AND clients, so auth.uid() must be present.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.exercise_library WHERE id = p_exercise_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'exercise_not_found');
  END IF;

  WITH candidates AS (
    SELECT el.*,
      CASE
        WHEN v_src.category = 'strength' THEN
          el.muscle_id = v_src.muscle_id
          AND el.subdivision_id IS NOT DISTINCT FROM v_src.subdivision_id
          -- movement_pattern_id FK is unpopulated; the normalized TEXT column
          -- (Press / Fly / Pressaround / ...) is the reliable movement signal.
          AND el.movement_pattern IS NOT DISTINCT FROM v_src.movement_pattern
        WHEN v_src.category = 'cardio' THEN true
        WHEN v_src.category IN ('mobility', 'warmup', 'cooldown') THEN
          el.target_region_id IS NOT DISTINCT FROM v_src.target_region_id
        WHEN v_src.category = 'physio' THEN
          el.physio_purpose_id IS NOT DISTINCT FROM v_src.physio_purpose_id
          AND (v_src.target_region_id IS NULL
               OR el.target_region_id IS NOT DISTINCT FROM v_src.target_region_id)
        ELSE false
      END AS is_match
    FROM public.exercise_library el
    WHERE el.id <> v_src.id
      AND el.is_active
      AND el.category = v_src.category
      AND (el.is_global OR el.created_by_coach_id = auth.uid())
  ),
  ranked AS (
    SELECT c.*,
      CASE
        WHEN v_src.category = 'strength'
             AND c.resistance_profiles && v_src.resistance_profiles THEN 2
        WHEN v_src.category = 'cardio'
             AND c.cardio_movement_id IS NOT DISTINCT FROM v_src.cardio_movement_id THEN 2
        WHEN v_src.category IN ('mobility', 'warmup', 'cooldown')
             AND c.technique_id IS NOT DISTINCT FROM v_src.technique_id THEN 2
        ELSE 1
      END AS quality_score,
      CASE WHEN p_available_equipment IS NOT NULL
                AND c.equipment = ANY(p_available_equipment) THEN 1 ELSE 0 END AS equip_score
    FROM candidates c
    WHERE c.is_match
  )
  SELECT jsonb_build_object(
    'source', jsonb_build_object('id', v_src.id, 'name', v_src.name, 'category', v_src.category),
    'substitutes', COALESCE((
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT r.id, r.name, r.equipment, r.primary_muscle, r.resistance_profiles,
               r.cardio_movement_id, r.technique_id, r.target_region_id,
               CASE WHEN r.quality_score = 2 THEN 'exact' ELSE 'close' END AS match
        FROM ranked r
        ORDER BY r.quality_score DESC, r.equip_score DESC, r.name
        LIMIT GREATEST(p_limit, 1)
      ) x
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
