-- Phase 1 grant for log_addon_session_atomic (split per splitter-bug pattern).
--
-- authenticated -- any logged-in user may attempt to log; the RPC's
-- eligibility check (is_addon_eligible_professional) rejects non-eligible
-- callers. Admins, the assigned coach with the right subrole, and active
-- care-team specialists are the only paths that succeed.
--
-- DO-block wrapper: see 20260524140110 for splitter-bug rationale.

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.log_addon_session_atomic(uuid, date, text) FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.log_addon_session_atomic(uuid, date, text) TO authenticated';
END
$$;
