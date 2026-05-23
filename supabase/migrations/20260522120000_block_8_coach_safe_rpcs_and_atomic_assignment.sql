-- =============================================================================
-- Block 8 pre-launch audit -- close coach-experience P0/P1 findings.
-- =============================================================================
-- Adds 3 SECURITY DEFINER RPCs to replace 4 of the 5 RLS-broken
-- coaches_client_safe callers, plus an atomic assign_coach_atomic RPC that
-- closes the 1:1 capacity race condition (Block 8 P0-2). Also tightens the
-- coach_teams_read_active policy from PUBLIC to authenticated (Block 8 P1-5).
--
-- The 5th coaches_client_safe caller (WelcomeModal) reuses the existing
-- get_coach_for_client RPC shipped in migration 20260517104551 -- no new RPC
-- needed for that one.
--
-- Findings catalog: docs/pre-launch-review-findings.md (Block 8).
-- =============================================================================

-- ----------------------------------------------------------------------------
-- 1. list_active_coaches_for_service(p_service_id)
-- ----------------------------------------------------------------------------
-- Used by: src/components/onboarding/CoachPreferenceSection.tsx
--
-- Returns active coaches who (a) have a coach_service_limits row for the
-- service, (b) have available capacity (pending+active subscriptions <
-- max_clients), and (c) have status='active'.
--
-- Why a new RPC rather than reusing get_coach_for_client: the existing RPC
-- gates on is_primary_coach_for_user / is_care_team_member_for_client, which
-- both return false during onboarding (no relationship exists yet). Output
-- column set matches what coaches_client_safe used to return, plus computed
-- capacity fields so the FE no longer needs the per-coach count loop.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_active_coaches_for_service(p_service_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH coach_loads AS (
    SELECT
      c.id                  AS coach_id,
      c.user_id,
      c.first_name,
      c.last_name,
      c.profile_picture_url,
      c.short_bio,
      c.specializations,
      c.status,
      csl.max_clients,
      (
        SELECT COUNT(*)::int
        FROM public.subscriptions s
        WHERE s.coach_id = c.user_id
          AND s.service_id = p_service_id
          AND s.status IN ('pending', 'active')
      ) AS current_count
    FROM public.coaches c
    JOIN public.coach_service_limits csl
      ON csl.coach_id = c.id
     AND csl.service_id = p_service_id
    WHERE c.status = 'active'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',                  coach_id,
    'user_id',             user_id,
    'first_name',          first_name,
    'last_name',           last_name,
    'profile_picture_url', profile_picture_url,
    'short_bio',           short_bio,
    'specializations',     specializations,
    'status',              status,
    'max_clients',         max_clients,
    'current_clients',     current_count,
    'available_spots',     GREATEST(max_clients - current_count, 0)
  ) ORDER BY coach_id), '[]'::jsonb)
  FROM coach_loads
  WHERE current_count < max_clients;
$$;

COMMENT ON FUNCTION public.list_active_coaches_for_service(uuid) IS
  'Returns active coaches with available capacity for the given service. Used '
  'during onboarding (CoachPreferenceSection) before any client/coach '
  'relationship exists -- get_coach_for_client returns NULL in that state. '
  'Output column set matches the coaches_client_safe view (no PII) plus '
  'pre-computed max_clients / current_clients / available_spots.';

GRANT EXECUTE ON FUNCTION public.list_active_coaches_for_service(uuid)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. list_active_teams_for_client()
-- ----------------------------------------------------------------------------
-- Used by:
--   src/components/client/ChooseTeamPrompt.tsx
--   src/components/client/ChangeTeamDialog.tsx
--
-- Returns active teams with their head-coach name + current member count.
-- Bundling avoids the N+1 (one coaches_client_safe lookup + one count per
-- team) and lets us read coach name from coaches_public via SECURITY DEFINER,
-- bypassing the RLS-broken view.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_active_teams_for_client()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',               t.id,
    'name',             t.name,
    'description',      t.description,
    'tags',             COALESCE(t.tags, '{}'::text[]),
    'max_members',      t.max_members,
    'coach_id',         t.coach_id,
    'coach_first_name', cp.first_name,
    'coach_last_name',  cp.last_name,
    'member_count', (
      SELECT COUNT(*)::int
      FROM public.subscriptions s
      WHERE s.team_id = t.id
        AND s.status IN ('pending', 'active')
    )
  ) ORDER BY t.name), '[]'::jsonb)
  FROM public.coach_teams t
  LEFT JOIN public.coaches_public cp
    ON cp.user_id = t.coach_id
  WHERE t.is_active = true;
$$;

COMMENT ON FUNCTION public.list_active_teams_for_client() IS
  'Returns active teams with head-coach name + current member count. Used by '
  'team selection UIs (ChooseTeamPrompt, ChangeTeamDialog). Reads coach name '
  'from coaches_public via SECURITY DEFINER to avoid the RLS-broken '
  'coaches_client_safe view. member_count counts pending+active subscriptions.';

GRANT EXECUTE ON FUNCTION public.list_active_teams_for_client() TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. get_coaches_for_subscription_addons(p_subscription_id)
-- ----------------------------------------------------------------------------
-- Used by: src/components/client/PlanBillingCard.tsx
--
-- Returns the staff first/last name for each active addon on the caller-owned
-- subscription. Gated on caller owning the subscription. Replaces the
-- coaches_client_safe .in('user_id', staffIds) batch read.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_coaches_for_subscription_addons(
  p_subscription_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',    sa.staff_user_id,
    'first_name', cp.first_name,
    'last_name',  cp.last_name
  )), '[]'::jsonb)
  FROM public.subscription_addons sa
  LEFT JOIN public.coaches_public cp
    ON cp.user_id = sa.staff_user_id
  WHERE sa.subscription_id = p_subscription_id
    AND sa.status = 'active'
    AND sa.staff_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.id = p_subscription_id
        AND s.user_id = (SELECT auth.uid())
    );
$$;

COMMENT ON FUNCTION public.get_coaches_for_subscription_addons(uuid) IS
  'Returns staff first/last name for each active addon on the caller-owned '
  'subscription. Used by PlanBillingCard to display care-team staff names. '
  'Returns empty array if the caller does not own the subscription.';

GRANT EXECUTE ON FUNCTION public.get_coaches_for_subscription_addons(uuid)
  TO authenticated;

-- ----------------------------------------------------------------------------
-- 4a. coach_assignment_would_block(p_coach_user_id, p_service_id)
-- ----------------------------------------------------------------------------
-- Block 8 P1-7: Lead-coach tier guardrails. The compensation rules in
-- CLAUDE.md ("Lead Coach blocked from 1:1 Online; Lead+Lead blocked from 1:1
-- Complete") are enforced reactively by calculate_subscription_payout — it
-- returns blocked=true when the IGU profit floor is violated, but ONLY if
-- you call it after the subscription is created. A bad assignment leaves
-- the subscription in a stuck state with no pricing path.
--
-- This helper pre-computes the no-dietitian IGU profit (the best-case
-- scenario at signup time) and returns true if assigning the coach would
-- violate the floor. Use as a candidate filter in assign_coach_atomic.
--
-- The Lead+Lead-on-Complete case is NOT covered by this check — that
-- requires a dietitian, which isn't assigned at signup. Admin must enforce
-- it when adding a Lead dietitian to a Lead coach's 1:1 Complete client
-- (separate workflow, separate audit).

CREATE OR REPLACE FUNCTION public.coach_assignment_would_block(
  p_coach_user_id uuid,
  p_service_id    uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_slug   text;
  v_service_type   text;
  v_client_price   numeric;
  v_coach_level    professional_level;
  v_coach_payout   numeric;
  v_igu_ops        numeric;
  v_igu_profit     numeric;
  v_threshold      numeric;
BEGIN
  SELECT srv.slug, srv.type, sp.price_kwd
    INTO v_service_slug, v_service_type, v_client_price
  FROM public.services srv
  JOIN public.service_pricing sp ON sp.service_id = srv.id
  WHERE srv.id = p_service_id;

  IF v_client_price IS NULL THEN
    -- No price set -- treat as non-blocking, let downstream calc surface it.
    RETURN false;
  END IF;

  SELECT COALESCE(cp.coach_level, 'junior') INTO v_coach_level
  FROM public.coaches_public cp
  WHERE cp.user_id = p_coach_user_id;
  v_coach_level := COALESCE(v_coach_level, 'junior');

  SELECT COALESCE(payout_kwd, 0) INTO v_coach_payout
  FROM public.coach_payout_rates
  WHERE service_id = p_service_id
    AND role = 'coach'
    AND level = v_coach_level;
  v_coach_payout := COALESCE(v_coach_payout, 0);

  SELECT COALESCE(payment_processing_kwd + platform_cost_kwd + admin_overhead_kwd, 0)
    INTO v_igu_ops
  FROM public.igu_operations_costs
  WHERE service_id = p_service_id;
  v_igu_ops := COALESCE(v_igu_ops, 0);

  -- No dietitian at signup -- compute IGU profit as if coach-only.
  v_igu_profit := v_client_price - v_coach_payout - v_igu_ops;

  -- Match the threshold logic in calculate_subscription_payout.
  IF v_service_type = 'team' OR v_service_slug = 'one_to_one_online' THEN
    v_threshold := 3;
  ELSE
    v_threshold := 5;
  END IF;

  RETURN v_igu_profit < v_threshold;
END;
$$;

COMMENT ON FUNCTION public.coach_assignment_would_block(uuid, uuid) IS
  'Returns true if assigning the given coach to the given service would '
  'result in calculate_subscription_payout returning blocked=true (best-case '
  'no-dietitian math). Used by assign_coach_atomic to filter out candidates '
  'that would create a stuck-state subscription.';

GRANT EXECUTE ON FUNCTION public.coach_assignment_would_block(uuid, uuid)
  TO service_role;

-- ----------------------------------------------------------------------------
-- 4. assign_coach_atomic(...)
-- ----------------------------------------------------------------------------
-- Used by: supabase/functions/submit-onboarding/index.ts
--
-- Replaces the read-then-write block in submit-onboarding that did the
-- capacity-counting + subscription INSERT separately. The original logic has
-- a TOCTOU race: two concurrent 1:1 signups read the same count, both pass
-- the < max_clients check, both INSERT, the coach ends up over-allocated.
--
-- This RPC locks coach_service_limits rows FOR UPDATE during candidate
-- scoring, re-checks capacity after acquiring the lock, and INSERTs the
-- subscription within the same transaction. Concurrent attempts on the same
-- coach serialize on the row lock -- the second one sees the first's INSERT
-- in its COUNT(*) and skips the coach.
--
-- Also fixes Block 8 P1-3 (team-plan fallback to admin role) and P1-4
-- (invalid selected_team_id silent coachless subscription): both now flag
-- needs_coach_assignment=true instead of polluting admin.
--
-- Returns JSONB:
--   {
--     subscription_id,
--     coach_user_id,            // NULL if needs_coach_assignment
--     coach_assignment_method,  // 'auto' | 'preference'
--     needs_coach_assignment,
--     was_auto_assigned
--   }
--
-- Raises on subscription INSERT failure -- caller maps to HTTP 500.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_coach_atomic(
  p_user_id                 uuid,
  p_service_id              uuid,
  p_focus_areas             text[] DEFAULT '{}',
  p_requested_coach_id      uuid    DEFAULT NULL,
  p_is_team_plan            boolean DEFAULT false,
  p_selected_team_id        uuid    DEFAULT NULL,
  p_session_booking_enabled boolean DEFAULT false,
  p_weekly_session_limit    integer DEFAULT NULL,
  p_session_duration_minutes integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_user_id      uuid    := NULL;
  v_was_auto_assigned  boolean := false;
  v_assignment_method  text    := 'auto';
  v_needs_assignment   boolean := false;
  v_subscription_id    uuid;
  v_winner_user_id     uuid;
  v_winner_max_clients integer;
  v_winner_count       integer;
  v_team_coach_id      uuid;
  v_chosen_user_id     uuid;
BEGIN
  ----------------------------------------------------------------
  -- Branch A: team plan
  ----------------------------------------------------------------
  IF p_is_team_plan THEN
    IF p_selected_team_id IS NOT NULL THEN
      SELECT coach_id INTO v_team_coach_id
      FROM public.coach_teams
      WHERE id = p_selected_team_id
        AND is_active = true;

      IF v_team_coach_id IS NOT NULL THEN
        v_coach_user_id := v_team_coach_id;
        v_assignment_method := 'auto';
      ELSE
        -- Invalid team id -- mark for admin triage rather than create an
        -- orphan member with no coach (Block 8 P1-4).
        v_coach_user_id := NULL;
        v_needs_assignment := true;
      END IF;
    ELSE
      -- Team plan with no selected_team_id -- mark for admin triage rather
      -- than silently assigning to admin role and polluting coach metrics
      -- (Block 8 P1-3).
      v_coach_user_id := NULL;
      v_needs_assignment := true;
    END IF;

  ELSE
    ----------------------------------------------------------------
    -- Branch B: 1:1 plan
    ----------------------------------------------------------------

    -- B1: requested coach (client picked a specific coach)
    IF p_requested_coach_id IS NOT NULL THEN
      -- Lock the csl row for this coach+service to serialize concurrent
      -- attempts to claim the same spot.
      SELECT c.user_id, csl.max_clients
        INTO v_winner_user_id, v_winner_max_clients
      FROM public.coach_service_limits csl
      JOIN public.coaches c ON c.id = csl.coach_id
      WHERE csl.coach_id = p_requested_coach_id
        AND csl.service_id = p_service_id
        AND c.status = 'active'
      FOR UPDATE OF csl;

      IF v_winner_user_id IS NOT NULL THEN
        SELECT COUNT(*)::int INTO v_winner_count
        FROM public.subscriptions
        WHERE coach_id = v_winner_user_id
          AND service_id = p_service_id
          AND status IN ('pending', 'active');

        -- Capacity AND tier-payout guardrail (P1-7). A Lead coach on 1:1
        -- Online has a payout high enough that IGU profit dips below the
        -- 3 KWD floor -- calculate_subscription_payout would block pricing
        -- and leave the subscription stuck. Reject the preference here
        -- and let B2 auto-assign find a non-blocking coach.
        IF v_winner_count < v_winner_max_clients
           AND NOT public.coach_assignment_would_block(v_winner_user_id, p_service_id)
        THEN
          v_coach_user_id := v_winner_user_id;
          v_assignment_method := 'preference';
        END IF;
      END IF;
    END IF;

    -- B2: auto-assign if no preference satisfied
    IF v_coach_user_id IS NULL THEN
      v_was_auto_assigned := true;
      v_assignment_method := 'auto';

      -- Lock all eligible csl rows FOR UPDATE; concurrent signups serialize
      -- against each other. ORDER BY coach_id keeps the lock order stable
      -- across concurrent transactions to prevent deadlocks.
      WITH locked_limits AS (
        SELECT csl.coach_id, csl.max_clients, c.user_id,
               c.specializations, c.last_assigned_at, c.created_at
        FROM public.coach_service_limits csl
        JOIN public.coaches c ON c.id = csl.coach_id
        WHERE csl.service_id = p_service_id
          AND c.status IN ('active', 'approved')
        ORDER BY csl.coach_id
        FOR UPDATE OF csl
      ),
      scored AS (
        SELECT ll.*,
          (
            SELECT COUNT(*)::int FROM public.subscriptions s
            WHERE s.coach_id = ll.user_id
              AND s.service_id = p_service_id
              AND s.status IN ('pending', 'active')
          ) AS current_count
        FROM locked_limits ll
      ),
      ranked AS (
        SELECT *,
          COALESCE((
            SELECT COUNT(*)::int
            FROM unnest(COALESCE(specializations, '{}'::text[])) AS spec(s)
            WHERE LOWER(TRIM(spec.s)) = ANY(
              SELECT LOWER(TRIM(fa.s)) FROM unnest(p_focus_areas) AS fa(s)
            )
          ), 0) * 10 - current_count AS score
        FROM scored
        WHERE current_count < max_clients
          -- P1-7: skip candidates whose tier+service combo would result in
          -- a payout block (e.g. Lead coach on 1:1 Online).
          AND NOT public.coach_assignment_would_block(user_id, p_service_id)
      )
      SELECT user_id INTO v_chosen_user_id
      FROM ranked
      ORDER BY
        score DESC,
        current_count ASC,
        COALESCE(last_assigned_at, 'epoch'::timestamptz) ASC,
        created_at ASC
      LIMIT 1;

      IF v_chosen_user_id IS NOT NULL THEN
        v_coach_user_id := v_chosen_user_id;
      END IF;
    END IF;

    -- B3: still no coach -- flag for manual assignment
    IF v_coach_user_id IS NULL THEN
      v_needs_assignment := true;
    END IF;
  END IF;

  ----------------------------------------------------------------
  -- INSERT subscription within the same transaction.  If we got here
  -- from B1/B2 with a winner, the csl row lock is still held -- the
  -- INSERT cannot race against a concurrent tx claiming the same spot.
  ----------------------------------------------------------------
  INSERT INTO public.subscriptions (
    user_id,
    service_id,
    coach_id,
    status,
    coach_assignment_method,
    needs_coach_assignment,
    team_id,
    session_booking_enabled,
    weekly_session_limit,
    session_duration_minutes
  )
  VALUES (
    p_user_id,
    p_service_id,
    v_coach_user_id,
    'pending',
    v_assignment_method,
    v_needs_assignment,
    p_selected_team_id,
    p_session_booking_enabled,
    CASE WHEN p_session_booking_enabled THEN p_weekly_session_limit ELSE NULL END,
    CASE WHEN p_session_booking_enabled THEN p_session_duration_minutes ELSE NULL END
  )
  RETURNING id INTO v_subscription_id;

  -- Update coach's last_assigned_at for round-robin fairness. Direct
  -- single-column write to coaches is allowed per the Phase-1 refactor
  -- rules; same pattern as submit-onboarding's prior call.
  IF v_coach_user_id IS NOT NULL AND NOT p_is_team_plan THEN
    UPDATE public.coaches
       SET last_assigned_at = now()
     WHERE user_id = v_coach_user_id;
  END IF;

  RETURN jsonb_build_object(
    'subscription_id',         v_subscription_id,
    'coach_user_id',           v_coach_user_id,
    'coach_assignment_method', v_assignment_method,
    'needs_coach_assignment',  v_needs_assignment,
    'was_auto_assigned',       v_was_auto_assigned
  );
END;
$$;

COMMENT ON FUNCTION public.assign_coach_atomic(
  uuid, uuid, text[], uuid, boolean, uuid, boolean, integer, integer
) IS
  'Atomic coach assignment + subscription INSERT for submit-onboarding. Locks '
  'coach_service_limits rows FOR UPDATE during candidate scoring to prevent '
  'the read-then-write race where two concurrent 1:1 signups can over-allocate '
  'the same coach. Returns jsonb with the created subscription_id and the '
  'chosen coach (NULL if needs_coach_assignment=true).';

-- submit-onboarding invokes this with the service-role key after running its
-- own auth checks; explicitly restrict to service_role.
REVOKE ALL ON FUNCTION public.assign_coach_atomic(
  uuid, uuid, text[], uuid, boolean, uuid, boolean, integer, integer
) FROM public;
GRANT EXECUTE ON FUNCTION public.assign_coach_atomic(
  uuid, uuid, text[], uuid, boolean, uuid, boolean, integer, integer
) TO service_role;

-- ----------------------------------------------------------------------------
-- 5. Block 8 P1-5: tighten coach_teams_read_active to TO authenticated
-- ----------------------------------------------------------------------------
-- The existing coach_teams_read_active policy (migration 20260212140000) has
-- no role gate -- the implicit role is PUBLIC, which means anon users can
-- read all active teams via the anon Supabase client. Functionally fine
-- (team names + max_members aren't sensitive), but it's a defense-in-depth
-- gap -- tighten to authenticated.
--
-- The other three coach_teams policies (coach_insert / coach_update /
-- coach_delete) already use auth.uid() in their predicates so they're
-- functionally safe, but rewriting them with TO authenticated would be
-- explicit -- left for a future cleanup pass to avoid drift with the
-- 20260219100000 disk-IO performance rewrite that touched these.
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS coach_teams_read_active ON public.coach_teams;
CREATE POLICY coach_teams_read_active
  ON public.coach_teams
  FOR SELECT
  TO authenticated
  USING (is_active = true);
