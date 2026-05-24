-- Phase 0/F7 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F7) and § "Open Questions"
-- (cross-subrole eligibility -- resolved 2026-05-24 as Strict-match).
--
-- Returns true iff p_staff_id can log a session against p_purchase_id:
--   (1) is admin, OR
--   (2) holds the addon_services.required_subrole as an approved subrole
--       AND is an active care-team member for the purchase's client.
--
-- Used by:
--   - log_addon_session_atomic RPC (Phase 1) as a guard before INSERT
--   - addon_session_logs RLS write policy (Phase 1)
--   - frontend visibility check (LogAddonSessionDialog -- Phase 4) to hide
--     the log button on non-eligible viewers
--
-- One CREATE FUNCTION per file (splitter-bug guard, see
-- memory/feedback_supabase_cli_dollar_quote_splitter.md). GRANT EXECUTE
-- lives in 20260524130610.

CREATE OR REPLACE FUNCTION public.is_addon_eligible_professional(
  p_staff_id    uuid,
  p_purchase_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id        uuid;
  v_required_subrole text;
  v_deleted_at       timestamptz;
BEGIN
  -- Admin bypass: an admin can always log on behalf of any professional
  -- (rare but necessary for specialist-out-of-town fill-ins).
  IF public.is_admin(p_staff_id) THEN
    RETURN true;
  END IF;

  -- Resolve the purchase. Tombstoned purchases are not eligible.
  SELECT ap.client_id, svc.required_subrole, ap.deleted_at
    INTO v_client_id, v_required_subrole, v_deleted_at
  FROM public.addon_purchases ap
  JOIN public.addon_services svc ON svc.id = ap.addon_service_id
  WHERE ap.id = p_purchase_id;

  IF NOT FOUND OR v_deleted_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Strict subrole match + active care-team membership.
  RETURN
    public.has_approved_subrole(p_staff_id, v_required_subrole)
    AND
    public.is_care_team_member_for_client(p_staff_id, v_client_id);
END;
$$;
