CREATE OR REPLACE VIEW public.exercise_movement_map WITH (security_invoker = true) AS
SELECT el.id AS exercise_id,
  mpg.movement_group_id AS movement_group_id,
  CASE WHEN mpg.movement_group_id = 'press'
       THEN CASE WHEN el.muscle_group = 'deltoids'
                   OR el.positioning IN ('Incline','Low Incline','Overhead')
                 THEN 'press_anterior' ELSE 'press_horizontal' END
       ELSE mpg.movement_group_id END AS movement_leaf_id
FROM public.exercise_library el
JOIN public.movement_pattern_groups mpg ON mpg.movement_pattern = el.movement_pattern
WHERE el.is_active;
GRANT SELECT ON public.exercise_movement_map TO authenticated, service_role;
