-- T1 Migration C — anon read: a coach's rating aggregate for /coaches/:slug +
-- Meet-the-Team. Over the coach's publicly-visible rows (§2 rule: show_on_coach_page
-- OR featured_public). avg suppressed (NULL) below the 5-review threshold so the
-- card falls back to its "New coach" state; count always returned. Anon-callable.

CREATE OR REPLACE FUNCTION public.get_coach_rating_aggregate(p_coach_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'count', s.c,
    'avg', CASE WHEN s.c >= 5 THEN s.a ELSE NULL END
  )
  FROM (
    SELECT count(*)::int AS c, round(avg(t.rating)::numeric, 2) AS a
    FROM public.testimonials t
    WHERE t.coach_id = p_coach_user_id
      AND t.display_consent
      AND t.withdrawn_at IS NULL
      AND (t.show_on_coach_page OR t.featured_public)
      AND NOT t.hidden_by_admin
  ) s;
$$;

REVOKE ALL ON FUNCTION public.get_coach_rating_aggregate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coach_rating_aggregate(uuid) TO anon, authenticated;
