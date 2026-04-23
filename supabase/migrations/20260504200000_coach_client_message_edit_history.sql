-- ============================================================
-- Migration: coach_client_message edit audit trail
--
-- Phase 3a allows the sender to edit their own coach_client_messages
-- rows in place, which makes the current message text the only thing
-- participants see. For conversations that may surface in compliance
-- reviews (nutrition changes, injury notes, payment discussions),
-- we want a tamper-evident record of what was actually sent.
--
-- This migration adds a mirror table + trigger: every time the
-- `message` field changes, the previous text is preserved with the
-- editor id and timestamp. Soft-delete (deleted_at flip) is already
-- timestamped on the parent row, so it doesn't need a separate audit
-- entry.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coach_client_message_edits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        UUID NOT NULL
                    REFERENCES public.coach_client_messages(id) ON DELETE CASCADE,
  edited_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  previous_message  TEXT NOT NULL,
  edited_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccme_message_recency
  ON public.coach_client_message_edits (message_id, edited_at DESC);

-- ------------------------------------------------------------
-- RLS: anyone who can read the parent message can read its edit
-- history. Edits are append-only from the server side (trigger),
-- so no INSERT / UPDATE / DELETE policies -- user-initiated writes
-- are blocked.
-- ------------------------------------------------------------
ALTER TABLE public.coach_client_message_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY ccme_select
ON public.coach_client_message_edits
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.coach_client_messages m
    WHERE m.id = coach_client_message_edits.message_id
      AND (
        auth.uid() = m.client_id
        OR public.is_care_team_member_for_client(auth.uid(), m.client_id)
      )
  )
);

CREATE POLICY ccme_admin_all
ON public.coach_client_message_edits
FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ------------------------------------------------------------
-- Trigger: on UPDATE of coach_client_messages, if `message`
-- actually changed, copy OLD.message into the audit table.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_coach_client_message_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.message IS DISTINCT FROM NEW.message THEN
    INSERT INTO public.coach_client_message_edits
      (message_id, edited_by, previous_message, edited_at)
    VALUES
      (OLD.id, auth.uid(), OLD.message, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_client_messages_edit_audit ON public.coach_client_messages;
CREATE TRIGGER coach_client_messages_edit_audit
  AFTER UPDATE ON public.coach_client_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.record_coach_client_message_edit();
