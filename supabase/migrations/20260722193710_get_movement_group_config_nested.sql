CREATE OR REPLACE FUNCTION public.get_movement_group_config()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH counts AS (SELECT movement_group_id, movement_leaf_id, count(*) AS n
                  FROM public.exercise_movement_map GROUP BY 1,2)
  SELECT jsonb_build_object(
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'label', g.label, 'sortOrder', g.sort_order,
        'variationCount', COALESCE((SELECT sum(n) FROM counts c WHERE c.movement_group_id=g.id),0),
        'subGroups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', sg.id, 'label', sg.label, 'sortOrder', sg.sort_order,
            'variationCount', COALESCE((SELECT sum(n) FROM counts c WHERE c.movement_leaf_id=sg.id),0)
          ) ORDER BY sg.sort_order)
          FROM public.movement_groups sg WHERE sg.parent_id=g.id AND sg.is_active), '[]'::jsonb)
      ) ORDER BY g.sort_order)
      FROM public.movement_groups g WHERE g.parent_id IS NULL AND g.is_active), '[]'::jsonb),
    'patternMap', COALESCE((SELECT jsonb_object_agg(movement_pattern, movement_group_id)
                            FROM public.movement_pattern_groups), '{}'::jsonb)
  );
$function$;
REVOKE ALL ON FUNCTION public.get_movement_group_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_movement_group_config() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_movement_group_config() TO authenticated, service_role;
