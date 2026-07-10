-- CPR3 — anon-safe clients-count band for the public coach card (spec §3.2, LOCKED).
--
-- Returns the coach's active-client count floored to the nearest 10 ("42 -> 40",
-- rendered "40+" by the frontend), or NULL when under 10 so a thin/new coach never
-- shows a lopsided count (the frontend null-omits the stat entirely).
--
-- Engagement metric, NOT revenue: reads `subscriptions` (includes payment-exempt
-- clients) per CLAUDE.md's decision rule (work/engagement -> subscriptions).
--
-- Intentionally anon-callable: it feeds the public /coach/:slug page (testimonials
-- plan T2). Follows the REVOKE-from-PUBLIC pattern but KEEPS anon EXECUTE, like
-- `list_public_teams_for_browser`. No `auth.uid() IS NULL` guard — public by design.
-- subscriptions.coach_id references coaches.user_id (verified 2026-07-10), so it
-- equals the coach's auth user_id.

CREATE OR REPLACE FUNCTION public.get_coach_client_count_band(p_coach_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*)::int
    INTO v_count
    FROM public.subscriptions s
   WHERE s.coach_id = p_coach_user_id
     AND s.status = 'active';

  IF v_count < 10 THEN
    RETURN NULL;  -- floor: hide the stat for thin/new coaches
  END IF;

  RETURN (v_count / 10) * 10;  -- integer floor to nearest 10
END;
$$;

REVOKE ALL ON FUNCTION public.get_coach_client_count_band(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coach_client_count_band(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_coach_client_count_band(uuid) IS
  'Anon-safe engagement band: active clients coached, floored to nearest 10, NULL under 10. Reads subscriptions (incl. payment-exempt), not paying_subscriptions. Feeds public /coach/:slug stats row (CPR3).';
