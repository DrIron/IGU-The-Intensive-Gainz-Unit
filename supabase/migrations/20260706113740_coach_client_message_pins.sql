-- MS1 — pinned messages on the coach<->client thread.
-- Staff (primary coach / active care-team member / admin) can pin a key message
-- to the top of a coach_client_messages thread; the client sees pins read-only.
-- pinned_by is a plain uuid audit stamp — NO FK to a coach/legacy table (the
-- care-team FK-legacy landmine already bit this area).

ALTER TABLE public.coach_client_messages
  ADD COLUMN pinned_at timestamptz,
  ADD COLUMN pinned_by uuid;

-- Fast "pins for this thread, newest-pinned first".
CREATE INDEX idx_ccm_pinned
  ON public.coach_client_messages (client_id, pinned_at DESC)
  WHERE pinned_at IS NOT NULL;

-- Staff-only pin/unpin. Direct UPDATE on the table is sender-only (ccm_update_own)
-- + admin (ccm_admin_all), so a coach can't pin a message they didn't send via
-- RLS — this SECURITY DEFINER RPC is the staff-scoped path. Model = MULTIPLE pins
-- (each message independently pinnable).
CREATE OR REPLACE FUNCTION public.set_coach_client_message_pinned(
  p_message_id uuid,
  p_pinned boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT client_id INTO v_client_id
  FROM coach_client_messages
  WHERE id = p_message_id AND deleted_at IS NULL;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Message not found or already deleted';
  END IF;

  -- Staff-only: primary coach, active care-team member, or admin. A client
  -- (auth.uid() = client_id) satisfies none of these -> denied.
  IF NOT (
    public.is_primary_coach_for_user(auth.uid(), v_client_id)
    OR public.is_care_team_member_for_client(auth.uid(), v_client_id)
    OR public.is_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Only staff can pin messages' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE coach_client_messages
  SET pinned_at = CASE WHEN p_pinned THEN now() ELSE NULL END,
      pinned_by = CASE WHEN p_pinned THEN auth.uid() ELSE NULL END
  WHERE id = p_message_id AND deleted_at IS NULL;

  RETURN jsonb_build_object('message_id', p_message_id, 'pinned', p_pinned);
END;
$$;

-- Mandatory grant scoping: default EXECUTE to anon+authenticated is removed;
-- only authenticated callers reach the function (anon -> 42501 at the grant).
REVOKE ALL ON FUNCTION public.set_coach_client_message_pinned(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_coach_client_message_pinned(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_coach_client_message_pinned(uuid, boolean) TO authenticated;
