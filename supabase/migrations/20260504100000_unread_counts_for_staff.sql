-- ============================================================
-- Migration: unread-counts RPC scoped to the calling staff user
--
-- The per-thread get_unread_message_count (migration 20260504000000)
-- is fine for a single client page, but the coach client directory
-- renders N clients at once. Calling it per row would create N
-- round-trips. This RPC returns the full map in one query.
--
-- Authorisation: implicit via is_care_team_member_for_client(). A
-- coach only sees counts for clients they actually have an active
-- care-team relationship with; other rows silently drop.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_unread_message_counts_for_staff()
RETURNS TABLE(client_id UUID, unread_count BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.client_id, COUNT(*) AS unread_count
  FROM public.coach_client_messages m
  WHERE m.deleted_at IS NULL
    AND m.sender_id <> auth.uid()
    AND NOT (auth.uid() = ANY(m.read_by))
    AND public.is_care_team_member_for_client(auth.uid(), m.client_id)
  GROUP BY m.client_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_message_counts_for_staff() TO authenticated;
