-- get_movement_group_config v2: six groups + PPL affinity rollup + enriched patternMap.
-- Returns { groups[], affinities[], patternMap{} }. `affinities` + object-shaped patternMap entries
-- are ADDITIVE (existing consumers read `groups` + the exercise_movement_map view). language sql.
CREATE OR REPLACE FUNCTION public.get_movement_group_config()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH leaf_counts AS (
    SELECT movement_leaf_id AS gid, count(*) AS n
    FROM public.exercise_movement_map
    WHERE movement_leaf_id IS NOT NULL
    GROUP BY movement_leaf_id
  ),
  group_counts AS (
    SELECT movement_group_id AS gid, count(*) AS n
    FROM public.exercise_movement_map
    WHERE movement_group_id IS NOT NULL
    GROUP BY movement_group_id
  ),
  subgroups AS (
    SELECT c.parent_id,
      jsonb_agg(jsonb_build_object(
        'id', c.id, 'label', c.label, 'sortOrder', c.sort_order,
        'variationCount', COALESCE(lc.n, 0)
      ) ORDER BY c.sort_order) AS subs
    FROM public.movement_groups c
    LEFT JOIN leaf_counts lc ON lc.gid = c.id
    WHERE c.parent_id IS NOT NULL AND c.is_active
    GROUP BY c.parent_id
  ),
  top AS (
    SELECT g.id, g.label, g.sort_order,
      COALESCE(gc.n, 0) AS n, COALESCE(sg.subs, '[]'::jsonb) AS subs
    FROM public.movement_groups g
    LEFT JOIN group_counts gc ON gc.gid = g.id
    LEFT JOIN subgroups sg ON sg.parent_id = g.id
    WHERE g.parent_id IS NULL AND g.is_active
  ),
  affinities AS (
    SELECT affinity,
      count(*) AS total,
      count(*) FILTER (WHERE NOT is_isolation) AS compound,
      count(*) FILTER (WHERE is_isolation) AS isolation
    FROM public.exercise_movement_map
    WHERE affinity IS NOT NULL
    GROUP BY affinity
  ),
  pattern_map AS (
    SELECT jsonb_object_agg(movement_pattern, jsonb_build_object(
      'group', movement_group_id, 'leaf', movement_leaf_id,
      'isolation', is_isolation, 'affinity', affinity
    )) AS pm
    FROM public.movement_pattern_groups
  )
  SELECT jsonb_build_object(
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'label', label, 'sortOrder', sort_order,
        'variationCount', n, 'subGroups', subs
      ) ORDER BY sort_order) FROM top), '[]'::jsonb),
    'affinities', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'affinity', affinity, 'total', total,
        'compound', compound, 'isolation', isolation
      ) ORDER BY affinity) FROM affinities), '[]'::jsonb),
    'patternMap', COALESCE((SELECT pm FROM pattern_map), '{}'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_movement_group_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_movement_group_config() TO authenticated, service_role;
