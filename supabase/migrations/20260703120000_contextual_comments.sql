-- ============================================================
-- B6 — Contextual comments (sessions · check-ins · adjustments)
--
-- A short threaded note attached to a specific object — a logged session, a
-- weekly check-in, or a nutrition adjustment — living where that object renders.
-- Distinct from the flat coach_client_messages thread and the staff-only
-- care_team_messages channel. One polymorphic table; RLS mirrors
-- coach_client_messages; a BEFORE INSERT ownership trigger stands in for the
-- polymorphic FK that Postgres can't express.
--
-- Object keys are CANONICAL-ONLY (legacy client_* ids are being dropped):
--   session     -> plan_sessions.id      (the client's clone plan_session — occurs
--                                          exactly once on their calendar = the instance)
--   checkin     -> adherence_logs.id     (unified weekly check-in row)
--   adjustment  -> nutrition_adjustments.id
-- ============================================================

-- ------------------------------------------------------------
-- 1. Table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contextual_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Denormalized thread anchor: the client whose object this comment hangs off.
  -- Denormalizing client_id keeps RLS single-hop (no polymorphic join per row).
  client_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Who wrote it — the client themselves or a care-team member on their roster.
  author_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  object_type text NOT NULL CHECK (object_type IN ('session', 'checkin', 'adjustment')),
  object_id   uuid NOT NULL,

  comment     text NOT NULL CHECK (char_length(comment) BETWEEN 1 AND 2000),

  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz,
  -- Soft delete: rows stay readable (audit) and render as "[comment deleted]".
  -- No DELETE policy — retraction is UPDATE deleted_at (coach_client_messages pattern).
  deleted_at  timestamptz
);

-- Primary access pattern: all comments on one object, oldest-first.
CREATE INDEX IF NOT EXISTS idx_contextual_comments_object
  ON public.contextual_comments (client_id, object_type, object_id, created_at);

-- ------------------------------------------------------------
-- 2. Ownership-integrity trigger (polymorphic FK gap)
--
-- Postgres can't FK a single object_id at three different tables, so a BEFORE
-- INSERT trigger validates object_id belongs to client_id by object_type. It is
-- SECURITY DEFINER so it can read the ownership chains regardless of the inserting
-- caller's RLS on plan_sessions / adherence_logs / nutrition_phases.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.contextual_comments_validate_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ok boolean := false;
BEGIN
  -- FIRST branch, per the trigger lesson: service_role / migrations (auth.uid()
  -- NULL) bypass ownership validation so backfills + service_role edge functions
  -- are never blocked. Client/coach inserts always have a uid and fall through.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.object_type = 'session' THEN
    -- plan_sessions.id -> plan_id -> client_plan_assignment.client_id (any status).
    SELECT EXISTS (
      SELECT 1
      FROM public.plan_sessions ps
      JOIN public.client_plan_assignment a ON a.plan_id = ps.plan_id
      WHERE ps.id = NEW.object_id
        AND a.client_id = NEW.client_id
    ) INTO v_ok;

  ELSIF NEW.object_type = 'checkin' THEN
    -- adherence_logs.user_id is the client directly.
    SELECT EXISTS (
      SELECT 1
      FROM public.adherence_logs al
      WHERE al.id = NEW.object_id
        AND al.user_id = NEW.client_id
    ) INTO v_ok;

  ELSIF NEW.object_type = 'adjustment' THEN
    -- nutrition_adjustments has NO user_id — resolve via phase_id -> nutrition_phases.user_id.
    SELECT EXISTS (
      SELECT 1
      FROM public.nutrition_adjustments na
      JOIN public.nutrition_phases np ON np.id = na.phase_id
      WHERE na.id = NEW.object_id
        AND np.user_id = NEW.client_id
    ) INTO v_ok;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'contextual_comments: object % (type %) does not belong to client %',
      NEW.object_id, NEW.object_type, NEW.client_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

-- Trigger functions are invoked only by the trigger machinery and cannot be
-- called directly in normal SQL, but revoke the default public EXECUTE anyway
-- to match house hygiene (defense-in-depth; no role needs to call this).
REVOKE ALL ON FUNCTION public.contextual_comments_validate_ownership() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contextual_comments_validate_ownership() FROM anon;

CREATE TRIGGER contextual_comments_ownership
BEFORE INSERT ON public.contextual_comments
FOR EACH ROW
EXECUTE FUNCTION public.contextual_comments_validate_ownership();

-- ------------------------------------------------------------
-- 3. RLS — mirror coach_client_messages exactly
--
-- is_care_team_member_for_client() folds in admin + primary coach + any active
-- care-team assignment, so it already expresses the spec's four-condition set.
-- The explicit admin ALL policy keeps admin soft-delete working independently.
-- ------------------------------------------------------------
ALTER TABLE public.contextual_comments ENABLE ROW LEVEL SECURITY;

-- SELECT: the client + any care-team member (folds admin + primary coach).
CREATE POLICY contextual_comments_select
ON public.contextual_comments
FOR SELECT
USING (
  auth.uid() = client_id
  OR public.is_care_team_member_for_client(auth.uid(), client_id)
);

-- INSERT: author must be the caller and authorised for this client's thread.
-- Two-way by design — the client may reply on their own objects.
CREATE POLICY contextual_comments_insert
ON public.contextual_comments
FOR INSERT
WITH CHECK (
  author_id = auth.uid()
  AND deleted_at IS NULL
  AND (
    auth.uid() = client_id
    OR public.is_care_team_member_for_client(auth.uid(), client_id)
  )
);

-- UPDATE: only the author edits / soft-deletes their own comment.
CREATE POLICY contextual_comments_update_own
ON public.contextual_comments
FOR UPDATE
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

-- No DELETE policy — soft-delete via UPDATE deleted_at is the only retraction path.

-- Admin full access (explicit, so admin tooling / soft-delete doesn't depend on
-- is_care_team_member_for_client's internal admin fold-in staying put).
CREATE POLICY contextual_comments_admin_all
ON public.contextual_comments
FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
