-- ============================================================
-- Migration: Care Team Messages Table
-- Phase 22: IGU Nutrition System Enhancement
--
-- Inter-team communication about clients
-- IMPORTANT: Client CANNOT see these messages - care team only
-- ============================================================

CREATE TABLE IF NOT EXISTS public.care_team_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which client this is about
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Who sent the message
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Message content
  message text NOT NULL,
  message_type text NOT NULL DEFAULT 'general' CHECK (message_type IN (
    'general',          -- General discussion
    'nutrition',        -- Nutrition-specific
    'training',         -- Training-specific
    'progress',         -- Progress updates
    'concern',          -- Concerns/flags
    'handoff',          -- Handoff notes between team members
    'follow_up'         -- Follow-up reminders
  )),

  -- Priority
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Read tracking (array of user IDs who have read)
  read_by uuid[] DEFAULT '{}',

  -- Optional: mention specific team members
  mentions uuid[] DEFAULT '{}',

  -- Optional: attach to a specific resource
  related_phase_id uuid REFERENCES public.nutrition_phases(id) ON DELETE SET NULL,
  related_program_id uuid,  -- If we want to link to workout programs

  -- Optional: mark as resolved/closed
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_at timestamp with time zone,

  -- Metadata
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.care_team_messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- CLIENT CANNOT SEE - care team only
-- ============================================================

-- Care team members can view messages about their clients
CREATE POLICY "care_team_messages_team_select"
ON public.care_team_messages
FOR SELECT
USING (
  -- Must be care team for this client
  public.is_care_team_member_for_client(auth.uid(), client_id)
  -- And NOT the client themselves
  AND auth.uid() != client_id
);

-- Care team can send messages
CREATE POLICY "care_team_messages_team_insert"
ON public.care_team_messages
FOR INSERT
WITH CHECK (
  -- Must be care team for this client
  public.is_care_team_member_for_client(auth.uid(), client_id)
  -- Sender must be the authenticated user
  AND auth.uid() = sender_id
  -- Cannot be the client
  AND auth.uid() != client_id
);

-- Care team can update (mark as read, resolve)
CREATE POLICY "care_team_messages_team_update"
ON public.care_team_messages
FOR UPDATE
USING (
  public.is_care_team_member_for_client(auth.uid(), client_id)
  AND auth.uid() != client_id
);

-- Only sender can delete their own message
CREATE POLICY "care_team_messages_sender_delete"
ON public.care_team_messages
FOR DELETE
USING (
  auth.uid() = sender_id
);

-- Admins full access
CREATE POLICY "care_team_messages_admin_all"
ON public.care_team_messages
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ============================================================
-- Helper function to mark message as read
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_care_team_message_read(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.care_team_messages
  SET read_by = array_append(
    COALESCE(read_by, '{}'),
    auth.uid()
  ),
  updated_at = now()
  WHERE id = p_message_id
    AND NOT (auth.uid() = ANY(COALESCE(read_by, '{}')));
END;
$$;

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_care_team_messages_client_id ON public.care_team_messages(client_id);
CREATE INDEX idx_care_team_messages_sender_id ON public.care_team_messages(sender_id);
CREATE INDEX idx_care_team_messages_created_at ON public.care_team_messages(created_at DESC);
CREATE INDEX idx_care_team_messages_unresolved ON public.care_team_messages(client_id) WHERE is_resolved = false;
CREATE INDEX idx_care_team_messages_priority ON public.care_team_messages(priority) WHERE priority IN ('high', 'urgent');
CREATE INDEX idx_care_team_messages_type ON public.care_team_messages(message_type);

-- Add updated_at trigger
CREATE TRIGGER update_care_team_messages_updated_at
BEFORE UPDATE ON public.care_team_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Comments
COMMENT ON TABLE public.care_team_messages IS 'Inter-team communication about clients - CLIENT CANNOT SEE these messages';
COMMENT ON COLUMN public.care_team_messages.read_by IS 'Array of user IDs who have read this message';
COMMENT ON COLUMN public.care_team_messages.mentions IS 'Array of user IDs specifically mentioned/tagged';
COMMENT ON FUNCTION public.mark_care_team_message_read IS 'Adds current user to read_by array for a message';
