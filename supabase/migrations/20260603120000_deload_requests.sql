-- ============================================================
-- Migration: Client-initiated deload requests
-- Phase 6 of Planning Board Weekly Deltas
--
-- Adds a per-client request flow. Client presses "Need a deload" from
-- their dashboard; an INSERT lands here, an edge function emails the
-- primary coach + every active care-team member. Coach approves /
-- declines / schedules; an UPDATE fires the response email back to
-- the client.
--
-- Throttling is enforced at the DB level via a partial unique index --
-- at most one pending request per client at any time.
--
-- See: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §10
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deload_requests (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  client_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id          UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_message           TEXT CHECK (client_message IS NULL OR char_length(client_message) <= 500),

  status                   TEXT NOT NULL
                           CHECK (status IN ('pending', 'approved', 'declined', 'expired', 'cancelled'))
                           DEFAULT 'pending',

  coach_user_id            UUID REFERENCES auth.users(id),
  coach_responded_at       TIMESTAMPTZ,
  coach_response_message   TEXT CHECK (coach_response_message IS NULL OR char_length(coach_response_message) <= 500),

  -- Which week index in the client's program got (or will get) the deload.
  -- NULL until a coach approves. Stored for surfacing in the response email
  -- and the client's dashboard ("Deload scheduled for W4").
  approved_week_offset     INT,

  -- Which preset the coach picked when approving. Values mirror
  -- deloadPresets.ts ids: 'volume' / 'intensity' / 'recovery' / 'custom' / NULL.
  applied_preset_id        TEXT,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Coach roster lookup: pending requests for a primary coach, newest first.
CREATE INDEX IF NOT EXISTS idx_deload_requests_coach_pending
  ON public.deload_requests (coach_user_id, requested_at DESC)
  WHERE status = 'pending';

-- Client history + recent decline check (7-day cool-off): newest-first per
-- client, all statuses.
CREATE INDEX IF NOT EXISTS idx_deload_requests_client_recent
  ON public.deload_requests (client_id, requested_at DESC);

-- DB-enforced throttle: at most one pending request per client. A second
-- INSERT while one is pending raises unique_violation, which the frontend
-- catches and surfaces as "you already have a pending request."
CREATE UNIQUE INDEX IF NOT EXISTS deload_requests_one_pending_per_client
  ON public.deload_requests (client_id)
  WHERE status = 'pending';

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------
ALTER TABLE public.deload_requests ENABLE ROW LEVEL SECURITY;

-- READ: client themselves + any care-team member (which folds in primary
-- coach and admin) for that client.
CREATE POLICY deload_requests_select
ON public.deload_requests
FOR SELECT
USING (
  auth.uid() = client_id
  OR public.is_care_team_member_for_client(auth.uid(), client_id)
);

-- INSERT: only the client themselves, for their own subscription, in
-- pending status. Other fields default; coach_* fields stay NULL.
CREATE POLICY deload_requests_insert_client
ON public.deload_requests
FOR INSERT
WITH CHECK (
  client_id = auth.uid()
  AND status = 'pending'
);

-- UPDATE (client side): the client can cancel their own pending request.
-- They can flip status from 'pending' to 'cancelled'; nothing else.
CREATE POLICY deload_requests_update_client_cancel
ON public.deload_requests
FOR UPDATE
USING (
  client_id = auth.uid()
  AND status = 'pending'
)
WITH CHECK (
  client_id = auth.uid()
  AND status IN ('pending', 'cancelled')
);

-- UPDATE (coach / care team / admin side): respond to a request -- approve,
-- decline, or schedule. RLS scoping covers primary coach AND admin via the
-- helper; team-coach access falls under is_care_team_member_for_client
-- when assigned.
CREATE POLICY deload_requests_update_staff
ON public.deload_requests
FOR UPDATE
USING (
  public.is_care_team_member_for_client(auth.uid(), client_id)
  OR public.is_admin(auth.uid())
)
WITH CHECK (
  public.is_care_team_member_for_client(auth.uid(), client_id)
  OR public.is_admin(auth.uid())
);

-- Admin explicit ALL (mirrors coach_client_messages pattern -- defensive
-- against future tightening of is_care_team_member_for_client).
CREATE POLICY deload_requests_admin_all
ON public.deload_requests
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- ------------------------------------------------------------
-- 3. Helper RPC: get_pending_deload_request_for_client
--
-- Lets the client UI cheaply ask "do I have a pending request?" without
-- racing the partial-unique index on INSERT (which would surface as an
-- ugly error). Returns the row id + requested_at, or NULL.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pending_deload_request_for_client(p_client_id UUID)
RETURNS TABLE (
  request_id     UUID,
  requested_at   TIMESTAMPTZ,
  client_message TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, requested_at, client_message
  FROM public.deload_requests
  WHERE client_id = p_client_id
    AND status = 'pending'
    AND (
      auth.uid() = p_client_id
      OR public.is_care_team_member_for_client(auth.uid(), p_client_id)
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_pending_deload_request_for_client(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_deload_request_for_client(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pending_deload_request_for_client(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 4. Helper RPC: get_last_declined_deload_request_for_client
--
-- The "7-day cool-off after a decline" gate. Frontend reads
-- coach_responded_at + 7 days; if that's in the future, the request button
-- is disabled with a "you can request again on X" message.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_last_declined_deload_request_for_client(p_client_id UUID)
RETURNS TABLE (
  request_id           UUID,
  coach_responded_at   TIMESTAMPTZ,
  coach_response_message TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, coach_responded_at, coach_response_message
  FROM public.deload_requests
  WHERE client_id = p_client_id
    AND status = 'declined'
    AND coach_responded_at IS NOT NULL
    AND (
      auth.uid() = p_client_id
      OR public.is_care_team_member_for_client(auth.uid(), p_client_id)
    )
  ORDER BY coach_responded_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_last_declined_deload_request_for_client(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_last_declined_deload_request_for_client(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_last_declined_deload_request_for_client(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 5. Helper RPC: get_coach_deload_request_counts
--
-- Batched per-client pending counts for the coach roster view. Returns
-- (client_id, pending_count) for every client the caller is the primary
-- coach for OR is on the care team of. Lets CoachMyClientsPage render
-- destructive badges without an N+1 fan-out.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_coach_deload_request_counts()
RETURNS TABLE (
  client_id     UUID,
  pending_count INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dr.client_id,
    COUNT(*)::INT AS pending_count
  FROM public.deload_requests dr
  WHERE dr.status = 'pending'
    AND (
      public.is_care_team_member_for_client(auth.uid(), dr.client_id)
      OR public.is_admin(auth.uid())
    )
  GROUP BY dr.client_id;
$$;

REVOKE ALL ON FUNCTION public.get_coach_deload_request_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_deload_request_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_deload_request_counts() TO authenticated;

-- ------------------------------------------------------------
-- 6. Realtime
-- ------------------------------------------------------------
-- Both the client dashboard and the coach panel subscribe to changes on
-- this table so a pending request shows up live and a coach response
-- flips the badge without a poll. Same pattern as coach_client_messages.
ALTER PUBLICATION supabase_realtime ADD TABLE public.deload_requests;

-- ------------------------------------------------------------
-- 7. Comments
-- ------------------------------------------------------------
COMMENT ON TABLE public.deload_requests IS
  'Client-initiated deload week requests. One pending row at a time per '
  'client (enforced via partial unique index). Coach response flips status '
  'to approved/declined/scheduled and triggers the response email.';

COMMENT ON COLUMN public.deload_requests.approved_week_offset IS
  'Which 1-indexed week in the client''s active program got the deload. '
  'NULL until coach approves. Surfaces on the client dashboard.';

COMMENT ON COLUMN public.deload_requests.applied_preset_id IS
  'Deload preset id (matches deloadPresets.ts): volume / intensity / '
  'recovery / custom / NULL. Pure metadata -- the actual transformation '
  'lives in the muscle plan / client program edits and is not enforced here.';
