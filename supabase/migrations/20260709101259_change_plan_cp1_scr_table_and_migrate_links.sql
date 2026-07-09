-- Change-plan CP1 (foundation): subscription_change_requests table + the reusable
-- migrate_subscription_links helper. Scheduled-change model: a change is REQUESTED
-- now and APPLIED at the current sub's next_billing_date (see CHANGE_PLAN_BUILD.md).
-- CP1 is standalone and also fixes the pending-cancel orphan gap (coach rel left
-- with ended_at NULL) by giving cancel-subscription a helper to call.

-- ============================================================================
-- 1) subscription_change_requests — schedule + audit for a pending plan change.
-- ============================================================================
CREATE TABLE public.subscription_change_requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL,
  current_subscription_id  uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  target_service_id        uuid NOT NULL REFERENCES public.services(id),
  target_team_id           uuid REFERENCES public.coach_teams(id),           -- team target only
  coach_preference         text NOT NULL DEFAULT 'auto'
                             CHECK (coach_preference IN ('auto','keep','specific')),
  requested_coach_id       uuid,
  focus_areas              text[] NOT NULL DEFAULT '{}',
  target_price_kwd         numeric,                                          -- previewed new price (snapshot)
  effective_at             timestamptz NOT NULL,                            -- = current sub next_billing_date
  status                   text NOT NULL DEFAULT 'scheduled'
                             CHECK (status IN ('scheduled','applied','cancelled','needs_admin')),
  applied_subscription_id  uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL, -- set on apply
  requested_at             timestamptz NOT NULL DEFAULT now(),
  applied_at               timestamptz,
  block_reason             text                                             -- if needs_admin (guardrail)
);

COMMENT ON TABLE public.subscription_change_requests IS
  'Scheduled plan changes (change-plan flow). Requested now, applied at effective_at (= current sub next_billing_date). Writes go through the change-service edge fn (service_role); clients may only cancel their own scheduled row via RLS.';

-- One open (scheduled) request per user.
CREATE UNIQUE INDEX uq_scr_one_open
  ON public.subscription_change_requests(user_id)
  WHERE status = 'scheduled';

-- Due-request scan for the CP3 apply cron.
CREATE INDEX idx_scr_due
  ON public.subscription_change_requests(effective_at)
  WHERE status = 'scheduled';

ALTER TABLE public.subscription_change_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: own rows, admins, and active care-team members of the client.
CREATE POLICY scr_select_visible ON public.subscription_change_requests
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_care_team_member_for_client(auth.uid(), user_id)
  );

-- UPDATE: a client may cancel their OWN scheduled request (scheduled -> cancelled).
-- No other client-driven mutation; the edge fn (service_role) bypasses RLS for
-- schedule/apply. USING gates the pre-image to their own scheduled row; WITH CHECK
-- forces the post-image to a cancelled row still owned by them.
CREATE POLICY scr_cancel_own ON public.subscription_change_requests
  FOR UPDATE
  USING (user_id = auth.uid() AND status = 'scheduled')
  WITH CHECK (user_id = auth.uid() AND status = 'cancelled');

-- Admins manage everything.
CREATE POLICY scr_admin_all ON public.subscription_change_requests
  FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- No client INSERT/DELETE policies by design: inserts happen via the edge fn.

-- ============================================================================
-- 2) migrate_subscription_links(old, new) — re-point coach/program links old->new
--    inside one transaction. new NULL = cancel-cleanup (end coach rel + detach).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.migrate_subscription_links(
  p_old_subscription_id uuid,
  p_new_subscription_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach_rows_ended       integer := 0;
  v_plan_assignments_moved integer := 0;
  v_nutrition_active       integer := 0;
  v_user_id                uuid;
BEGIN
  -- Owning user (from the old sub) -- for the nutrition single-active assertion.
  SELECT user_id INTO v_user_id FROM public.subscriptions WHERE id = p_old_subscription_id;

  -- 1) End the OLD sub's active coach relationships. The NEW coach rel (if any) is
  --    created separately by assign_coach_atomic at apply -- never copy the old
  --    coach blindly (a tier change may re-pick).
  UPDATE public.coach_client_relationships
     SET ended_at = now(), updated_at = now()
   WHERE subscription_id = p_old_subscription_id
     AND ended_at IS NULL;
  GET DIAGNOSTICS v_coach_rows_ended = ROW_COUNT;

  -- 2) Canonical program assignment (P5 table -- preserve the row + logs, never delete).
  IF p_new_subscription_id IS NOT NULL THEN
    -- Move onto the new sub; follow the new sub's team + its active coach.
    UPDATE public.client_plan_assignment cpa
       SET subscription_id = p_new_subscription_id,
           team_id          = ns.team_id,
           primary_coach_id = COALESCE(nc.coach_id, cpa.primary_coach_id),
           updated_at       = now()
      FROM public.subscriptions ns
      LEFT JOIN LATERAL (
        SELECT coach_id
          FROM public.coach_client_relationships
         WHERE subscription_id = p_new_subscription_id
           AND ended_at IS NULL
         ORDER BY started_at DESC
         LIMIT 1
      ) nc ON true
     WHERE cpa.subscription_id = p_old_subscription_id
       AND ns.id = p_new_subscription_id;
  ELSE
    -- Cancel path: detach from the ending old sub (subscription_id is nullable),
    -- keep the assignment row + its logs.
    UPDATE public.client_plan_assignment
       SET subscription_id = NULL,
           updated_at       = now()
     WHERE subscription_id = p_old_subscription_id;
  END IF;
  GET DIAGNOSTICS v_plan_assignments_moved = ROW_COUNT;

  -- 3) nutrition_phases carry by user_id (not subscription); the helper never
  --    touches them -- just report the active count so callers can assert the
  --    single-active invariant held.
  SELECT count(*) INTO v_nutrition_active
    FROM public.nutrition_phases
   WHERE user_id = v_user_id AND is_active = true;

  RETURN jsonb_build_object(
    'coach_rows_ended',        v_coach_rows_ended,
    'plan_assignments_moved',  v_plan_assignments_moved,
    'nutrition_active',        v_nutrition_active
  );
END;
$$;

-- Plumbing helper for service_role callers only (change-service apply, cancel
-- cleanup, cron). It bypasses RLS to end another user's coach rel, so keep it off
-- anon/authenticated. The CALLER does the auth check.
REVOKE ALL ON FUNCTION public.migrate_subscription_links(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.migrate_subscription_links(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.migrate_subscription_links(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_subscription_links(uuid, uuid) TO service_role;
