CREATE OR REPLACE FUNCTION public.get_movement_group_config()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'groups', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', g.id, 'label', g.label, 'sortOrder', g.sort_order,
        'variationCount', (SELECT count(*) FROM public.exercise_library el
            JOIN public.movement_pattern_groups mpg ON mpg.movement_pattern = el.movement_pattern
            WHERE el.is_active AND mpg.movement_group_id = g.id)
      ) ORDER BY g.sort_order) FROM public.movement_groups g WHERE g.is_active), '[]'::jsonb),
    'patternMap', COALESCE((SELECT jsonb_object_agg(movement_pattern, movement_group_id)
                            FROM public.movement_pattern_groups), '{}'::jsonb)
  );
$function$;
REVOKE ALL ON FUNCTION public.get_movement_group_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_movement_group_config() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_movement_group_config() TO authenticated, service_role;
