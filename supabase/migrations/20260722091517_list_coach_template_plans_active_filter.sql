CREATE OR REPLACE FUNCTION public.list_coach_template_plans()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.updated_at DESC),'[]'::jsonb) FROM (
    SELECT p.id,p.name,p.description,p.level,p.tags,p.is_active,p.visibility,p.created_at,p.updated_at,
      (SELECT count(*) FROM public.plan_weeks w WHERE w.plan_id=p.id) AS week_count,
      (SELECT count(*) FROM public.plan_sessions s WHERE s.plan_id=p.id) AS session_count,
      (SELECT count(*) FROM public.plan_slots sl WHERE sl.plan_id=p.id AND sl.exercise_id IS NOT NULL) AS exercise_count
    FROM public.plan p WHERE p.kind='template' AND p.is_active AND p.owner_coach_id=auth.uid()
  ) t;
$function$;

REVOKE ALL ON FUNCTION public.list_coach_template_plans() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_coach_template_plans() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_coach_template_plans() TO authenticated, service_role;
