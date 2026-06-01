-- Follow-up to 20260601120000. Supabase grants EXECUTE to authenticated
-- EXPLICITLY (not only via PUBLIC) on some functions, so REVOKE FROM PUBLIC
-- did not remove it. The service-role-only RPCs must also revoke authenticated
-- so a logged-in user cannot call them. assign_coach_atomic and
-- book_session_atomic in particular trust p_user_id with no auth.uid guard and
-- are only ever reached through edge functions under the service role.
-- Wrapped in a DO block as dynamic SQL to sidestep the CLI splitter bug.
DO $do$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.assign_coach_atomic(p_user_id uuid, p_service_id uuid, p_focus_areas text[], p_requested_coach_id uuid, p_is_team_plan boolean, p_selected_team_id uuid, p_session_booking_enabled boolean, p_weekly_session_limit integer, p_session_duration_minutes integer) FROM authenticated';
  EXECUTE 'REVOKE ALL ON FUNCTION public.book_session_atomic(p_slot_id uuid, p_user_id uuid) FROM authenticated';
  EXECUTE 'REVOKE ALL ON FUNCTION public.coach_assignment_would_block(p_coach_user_id uuid, p_service_id uuid) FROM authenticated';
  EXECUTE 'REVOKE ALL ON FUNCTION public.process_care_team_discharges() FROM authenticated';
  EXECUTE 'REVOKE ALL ON FUNCTION public.purchase_addon_atomic(p_client_id uuid, p_addon_service_id uuid, p_payment_id uuid, p_quantity integer, p_discount_percent numeric) FROM authenticated';
END
$do$;
