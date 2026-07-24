-- Composition view: the client workout player reads this instead of parsing client_name.
CREATE OR REPLACE VIEW public.exercise_client_display
WITH (security_invoker = true) AS
SELECT
  el.id AS exercise_id,
  NULLIF(COALESCE(m.client_display_name, m.display_name), '')   AS client_muscle,
  NULLIF(COALESCE(ms.client_display_name, ms.display_name), '') AS client_focus,
  COALESCE(el.client_movement, el.client_name, el.name)         AS client_movement,
  btrim(
    COALESCE(NULLIF(COALESCE(m.client_display_name, m.display_name), '') || ' ', '')
    || COALESCE(el.client_movement, el.client_name, el.name)
  ) AS client_title
FROM public.exercise_library el
LEFT JOIN public.muscles m ON m.id = el.muscle_id
LEFT JOIN public.muscle_subdivisions ms ON ms.id = el.subdivision_id;

COMMENT ON VIEW public.exercise_client_display IS 'Client-facing exercise naming: title = client_muscle + client_movement (client_title precomposed); focus indicator = client_focus (NULL = hide). Coach surfaces keep exercise_library.name.';

REVOKE ALL ON public.exercise_client_display FROM PUBLIC;
REVOKE ALL ON public.exercise_client_display FROM anon;
GRANT SELECT ON public.exercise_client_display TO authenticated, service_role;
