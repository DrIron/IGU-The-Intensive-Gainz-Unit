-- Phase 0 grant for is_addon_eligible_professional (split from
-- 20260524130600 per splitter-bug pattern).
--
-- Read access for authenticated callers -- FE uses this to gate the
-- LogAddonSessionDialog button visibility. service_role gets it implicitly
-- (RPCs run as definer, but the explicit grant lets cron / scripts call it).

REVOKE ALL ON FUNCTION public.is_addon_eligible_professional(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_addon_eligible_professional(uuid, uuid) TO authenticated;
