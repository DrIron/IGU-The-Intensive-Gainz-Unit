-- WA1 — "Message coach about this session" (WhatsApp deep-link).
--
-- The workout-completion sheet lets a 1:1 client open WhatsApp pre-filled with a
-- recap of the session they just finished. That needs the coach's WhatsApp
-- number, which lives on coaches_private (PII) and is NOT exposed by
-- get_coach_for_client (migration 20260517104551). Clients cannot SELECT
-- coaches_private directly.
--
-- This dedicated RPC returns ONLY the number, ONLY to that coach's client,
-- mirroring get_coach_for_client's auth (primary coach OR active care-team
-- member) and following the mandatory REVOKE/GRANT convention for
-- SECURITY DEFINER RPCs (CLAUDE.md). Returns NULL when the caller isn't
-- assigned to the coach or the coach has no number set.

CREATE OR REPLACE FUNCTION public.get_coach_whatsapp_for_client(p_coach_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cpv.whatsapp_number
  FROM public.coaches_private cpv
  WHERE cpv.user_id = p_coach_user_id
    AND cpv.whatsapp_number IS NOT NULL
    AND cpv.whatsapp_number <> ''
    AND (
      public.is_primary_coach_for_user(p_coach_user_id, (SELECT auth.uid()))
      OR public.is_care_team_member_for_client(p_coach_user_id, (SELECT auth.uid()))
    );
$$;

COMMENT ON FUNCTION public.get_coach_whatsapp_for_client(uuid) IS
  'Returns a coach''s WhatsApp number (coaches_private PII) to the assigned '
  'client only (primary coach or active care-team member); NULL otherwise or '
  'when unset. Used by the workout-completion WhatsApp deep-link (WA1).';

REVOKE ALL ON FUNCTION public.get_coach_whatsapp_for_client(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_whatsapp_for_client(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_whatsapp_for_client(uuid) TO authenticated;
