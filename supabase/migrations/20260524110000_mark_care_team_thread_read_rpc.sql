-- B5-N7: mark_care_team_thread_read RPC
--
-- Collapses the N+1 markMessagesAsRead loop in CareTeamMessagesPanel
-- (src/components/nutrition/CareTeamMessagesPanel.tsx:164-176) into one
-- round-trip. Modeled on mark_coach_client_thread_read (migration
-- 20260504000000) with one critical divergence: care_team_messages
-- explicitly excludes the client per RLS migration 20260207100007
-- ("Client CANNOT see these messages"). So the auth gate REJECTS
-- auth.uid() = p_client_id outright, then requires care-team membership.
--
-- The UPDATE adds exactly one element (auth.uid()) to read_by, which
-- passes the B5-N9 append-only / caller-only-additions trigger shipped
-- in 20260524100000.

CREATE OR REPLACE FUNCTION public.mark_care_team_thread_read(p_client_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Care-team-only thread: clients are explicitly excluded by RLS,
  -- and SECURITY DEFINER would let them bypass that, so guard here.
  IF auth.uid() = p_client_id THEN
    RAISE EXCEPTION 'Clients cannot read care team messages';
  END IF;

  IF NOT public.is_care_team_member_for_client(auth.uid(), p_client_id) THEN
    RAISE EXCEPTION 'Not authorised for this thread';
  END IF;

  UPDATE public.care_team_messages
  SET read_by = ARRAY(SELECT DISTINCT UNNEST(read_by || ARRAY[auth.uid()]))
  WHERE client_id = p_client_id
    AND NOT (auth.uid() = ANY(read_by));
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_care_team_thread_read(UUID) TO authenticated;

COMMENT ON FUNCTION public.mark_care_team_thread_read(UUID) IS
  'Marks all care_team_messages for p_client_id as read by the caller. '
  'Rejects the client themselves (per care_team_messages RLS). '
  'Replaces the N+1 per-message UPDATE loop in CareTeamMessagesPanel.';
