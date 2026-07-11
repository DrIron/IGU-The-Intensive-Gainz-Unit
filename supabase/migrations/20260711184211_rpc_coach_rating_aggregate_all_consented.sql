-- T1 step 2a — aggregate honesty fix. The coach's public rating now averages
-- over ALL consented (non-withdrawn, non-hidden) reviews about them, NOT just
-- the ones the coach curated onto their page. Standard review-site pattern, and
-- it closes the cherry-pick vector (the coach controls show_on_coach_page, so
-- gating the avg on it would let them average only their favourites).
--
-- The list RPC get_coach_public_testimonials stays scoped to show_on_coach_page
-- (curated showcase); only this aggregate broadens. {count, avg} unchanged;
-- avg still NULL below the 5-review threshold.

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
      AND NOT t.hidden_by_admin
  ) s;
$$;

REVOKE ALL ON FUNCTION public.get_coach_rating_aggregate(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coach_rating_aggregate(uuid) TO anon, authenticated;
