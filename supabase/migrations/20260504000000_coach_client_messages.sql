-- ============================================================
-- Migration: Coach <-> Client messaging
-- Phase 3 of Client Overview expansion
--
-- Adds a single flat thread per client that both the client and every
-- active care-team member can read and write. Admin has full access.
-- Staff-to-staff channel stays on `care_team_messages` (existing,
-- staff-only per its own RLS).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Thread table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_client_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Thread anchor. There is always exactly one thread per client, so the
  -- client_id itself is the thread key -- no separate threads table.
  client_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Who wrote this message. Either the client themselves or a staff user
  -- on their active care team.
  sender_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  message     TEXT NOT NULL
              CHECK (char_length(message) BETWEEN 1 AND 4000),

  -- Array of user_ids who have seen this message. Same pattern as
  -- care_team_messages.read_by. Updated via SECURITY DEFINER RPC so
  -- readers don't need blanket UPDATE on the row.
  read_by     UUID[] NOT NULL DEFAULT '{}',

  edited_at   TIMESTAMPTZ,
  -- Soft delete: deleted messages stay as "[message deleted]" placeholders
  -- in the UI so retraction doesn't leave unexplained gaps in the convo.
  deleted_at  TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary access pattern: load a client's thread newest-first / oldest-first.
CREATE INDEX IF NOT EXISTS idx_ccm_client_created
  ON public.coach_client_messages (client_id, created_at DESC);

-- Partial index to speed up unread-count queries and read-scanning -- the
-- vast majority of rows at any time will not be deleted.
CREATE INDEX IF NOT EXISTS idx_ccm_client_active
  ON public.coach_client_messages (client_id)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------
ALTER TABLE public.coach_client_messages ENABLE ROW LEVEL SECURITY;

-- READ: client themselves + any care-team member for this client + admin.
-- is_care_team_member_for_client() already folds in admin and primary
-- coach; kept explicit here so the policy is self-documenting.
CREATE POLICY ccm_select
ON public.coach_client_messages
FOR SELECT
USING (
  auth.uid() = client_id
  OR public.is_care_team_member_for_client(auth.uid(), client_id)
);

-- INSERT: sender must be the caller and must be authorised for the thread.
CREATE POLICY ccm_insert
ON public.coach_client_messages
FOR INSERT
WITH CHECK (
  sender_id = auth.uid()
  AND deleted_at IS NULL
  AND (
    auth.uid() = client_id
    OR public.is_care_team_member_for_client(auth.uid(), client_id)
  )
);

-- UPDATE: only the original sender can edit / soft-delete their message.
-- Mark-as-read lives in a SECURITY DEFINER RPC below so readers don't
-- need UPDATE on the row body.
CREATE POLICY ccm_update_own
ON public.coach_client_messages
FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

-- No DELETE policy -- soft-delete via UPDATE is the only retraction path.

-- Admin gets full access (explicit so admin tooling doesn't depend on
-- is_care_team_member_for_client's internal admin fold-in staying put).
CREATE POLICY ccm_admin_all
ON public.coach_client_messages
FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ------------------------------------------------------------
-- 3. Mark-thread-read RPC
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_coach_client_thread_read(p_client_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    auth.uid() = p_client_id
    OR public.is_care_team_member_for_client(auth.uid(), p_client_id)
  ) THEN
    RAISE EXCEPTION 'Not authorised for this thread';
  END IF;

  UPDATE public.coach_client_messages
  SET read_by = ARRAY(SELECT DISTINCT UNNEST(read_by || ARRAY[auth.uid()]))
  WHERE client_id = p_client_id
    AND deleted_at IS NULL
    AND NOT (auth.uid() = ANY(read_by));
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_coach_client_thread_read(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4. Unread-count RPC (per thread, for the caller)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_message_count(p_client_id UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM public.coach_client_messages
  WHERE client_id = p_client_id
    AND deleted_at IS NULL
    AND sender_id <> auth.uid()       -- own sends don't count as unread
    AND NOT (auth.uid() = ANY(read_by))
    AND (
      auth.uid() = p_client_id
      OR public.is_care_team_member_for_client(auth.uid(), p_client_id)
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_unread_message_count(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 5. email_notifications.context_id (for per-thread throttling)
-- ------------------------------------------------------------
-- The existing dedup table is keyed only by (user_id, notification_type,
-- sent_at). A coach_client_message notification needs to be throttled per
-- (recipient, THREAD), otherwise a single "recent send" to a recipient
-- would suppress alerts from every other client on their roster.
ALTER TABLE public.email_notifications
  ADD COLUMN IF NOT EXISTS context_id UUID;

CREATE INDEX IF NOT EXISTS idx_email_notifications_throttle
  ON public.email_notifications (user_id, notification_type, context_id, sent_at DESC);

COMMENT ON COLUMN public.email_notifications.context_id IS
  'Optional context key for per-topic throttling. For notification_type '
  '''coach_client_message'' this holds the client_id (thread key).';
