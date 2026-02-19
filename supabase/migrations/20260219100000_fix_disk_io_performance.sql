-- ============================================================================
-- Migration: Fix Disk IO Performance
-- Date: 2026-02-19
-- Purpose: Address Supabase disk IO exhaustion warning
--   1. Fix 28 RLS policies: auth.uid() -> (select auth.uid()) for initplan optimization
--   2. Drop 2 duplicate indexes
--   3. Drop ~30 unused indexes on audit/log tables (write-heavy, rarely queried)
-- ============================================================================

-- ============================================================================
-- PART 1: Fix RLS auth.uid() initplan issues (28 policies)
-- Wrapping auth.uid() in (select ...) makes Postgres evaluate it once per query
-- instead of once per row. Same security, dramatically faster on large tables.
-- ============================================================================

-- --- progression_suggestions (4 policies) ---

DROP POLICY IF EXISTS "Clients see own suggestions" ON progression_suggestions;
CREATE POLICY "Clients see own suggestions"
  ON progression_suggestions FOR SELECT
  USING (client_id = (select auth.uid()));

DROP POLICY IF EXISTS "Coaches see client suggestions" ON progression_suggestions;
CREATE POLICY "Coaches see client suggestions"
  ON progression_suggestions FOR SELECT
  USING (
    public.is_care_team_member_for_client((select auth.uid()), client_id)
  );

DROP POLICY IF EXISTS "Clients insert own suggestions" ON progression_suggestions;
CREATE POLICY "Clients insert own suggestions"
  ON progression_suggestions FOR INSERT
  WITH CHECK (client_id = (select auth.uid()));

DROP POLICY IF EXISTS "Clients update own suggestions" ON progression_suggestions;
CREATE POLICY "Clients update own suggestions"
  ON progression_suggestions FOR UPDATE
  USING (client_id = (select auth.uid()))
  WITH CHECK (client_id = (select auth.uid()));

-- --- professional_levels (2 policies) ---

DROP POLICY IF EXISTS "admin_full_professional_levels" ON professional_levels;
CREATE POLICY "admin_full_professional_levels" ON professional_levels
  FOR ALL USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "authenticated_read_professional_levels" ON professional_levels;
CREATE POLICY "authenticated_read_professional_levels" ON professional_levels
  FOR SELECT USING ((select auth.role()) = 'authenticated');

-- --- service_hour_estimates (2 policies) ---

DROP POLICY IF EXISTS "admin_full_service_hour_estimates" ON service_hour_estimates;
CREATE POLICY "admin_full_service_hour_estimates" ON service_hour_estimates
  FOR ALL USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "authenticated_read_service_hour_estimates" ON service_hour_estimates;
CREATE POLICY "authenticated_read_service_hour_estimates" ON service_hour_estimates
  FOR SELECT USING ((select auth.role()) = 'authenticated');

-- --- igu_operations_costs (1 policy) ---

DROP POLICY IF EXISTS "admin_full_igu_operations_costs" ON igu_operations_costs;
CREATE POLICY "admin_full_igu_operations_costs" ON igu_operations_costs
  FOR ALL USING (public.is_admin((select auth.uid())));

-- --- staff_professional_info (2 policies) ---

DROP POLICY IF EXISTS "admin_full_staff_professional_info" ON staff_professional_info;
CREATE POLICY "admin_full_staff_professional_info" ON staff_professional_info
  FOR ALL USING (public.is_admin((select auth.uid())));

DROP POLICY IF EXISTS "user_read_own_staff_professional_info" ON staff_professional_info;
CREATE POLICY "user_read_own_staff_professional_info" ON staff_professional_info
  FOR SELECT USING ((select auth.uid()) = user_id);

-- --- addon_services (1 policy) ---

DROP POLICY IF EXISTS "admin_full_addon_services" ON addon_services;
CREATE POLICY "admin_full_addon_services" ON addon_services
  FOR ALL USING (public.is_admin((select auth.uid())));

-- --- addon_purchases (2 policies) ---

DROP POLICY IF EXISTS "client_read_own_addon_purchases" ON addon_purchases;
CREATE POLICY "client_read_own_addon_purchases" ON addon_purchases
  FOR SELECT USING ((select auth.uid()) = client_id);

DROP POLICY IF EXISTS "admin_full_addon_purchases" ON addon_purchases;
CREATE POLICY "admin_full_addon_purchases" ON addon_purchases
  FOR ALL USING (public.is_admin((select auth.uid())));

-- --- addon_session_logs (1 policy) ---

DROP POLICY IF EXISTS "admin_full_addon_session_logs" ON addon_session_logs;
CREATE POLICY "admin_full_addon_session_logs" ON addon_session_logs
  FOR ALL USING (public.is_admin((select auth.uid())));

-- --- muscle_program_templates (4 policies) ---

DROP POLICY IF EXISTS "coach_own_templates" ON public.muscle_program_templates;
CREATE POLICY "coach_own_templates" ON public.muscle_program_templates
  FOR SELECT TO authenticated
  USING (
    coach_id = (select auth.uid())
    OR is_system = true
    OR public.has_role((select auth.uid()), 'admin')
  );

DROP POLICY IF EXISTS "coach_insert_templates" ON public.muscle_program_templates;
CREATE POLICY "coach_insert_templates" ON public.muscle_program_templates
  FOR INSERT TO authenticated
  WITH CHECK (coach_id = (select auth.uid()));

DROP POLICY IF EXISTS "coach_update_own_templates" ON public.muscle_program_templates;
CREATE POLICY "coach_update_own_templates" ON public.muscle_program_templates
  FOR UPDATE TO authenticated
  USING (coach_id = (select auth.uid()));

DROP POLICY IF EXISTS "coach_delete_own_templates" ON public.muscle_program_templates;
CREATE POLICY "coach_delete_own_templates" ON public.muscle_program_templates
  FOR DELETE TO authenticated
  USING (coach_id = (select auth.uid()));

-- --- coach_teams (4 policies) ---

DROP POLICY IF EXISTS coach_teams_coach_insert ON public.coach_teams;
CREATE POLICY coach_teams_coach_insert ON public.coach_teams FOR INSERT
  WITH CHECK (
    (select auth.uid()) = coach_id
    AND EXISTS (
      SELECT 1 FROM public.coaches_public
      WHERE user_id = (select auth.uid()) AND is_head_coach = true
    )
  );

DROP POLICY IF EXISTS coach_teams_coach_update ON public.coach_teams;
CREATE POLICY coach_teams_coach_update ON public.coach_teams FOR UPDATE
  USING ((select auth.uid()) = coach_id)
  WITH CHECK ((select auth.uid()) = coach_id);

DROP POLICY IF EXISTS coach_teams_coach_delete ON public.coach_teams;
CREATE POLICY coach_teams_coach_delete ON public.coach_teams FOR DELETE
  USING ((select auth.uid()) = coach_id);

DROP POLICY IF EXISTS coach_teams_admin_all ON public.coach_teams;
CREATE POLICY coach_teams_admin_all ON public.coach_teams FOR ALL
  USING (public.is_admin((select auth.uid())));

-- --- subscriptions (1 policy) ---

DROP POLICY IF EXISTS "Coaches can read subscriptions for their teams" ON public.subscriptions;
CREATE POLICY "Coaches can read subscriptions for their teams"
  ON public.subscriptions
  FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM public.coach_teams WHERE coach_id = (select auth.uid())
    )
  );

-- --- profiles_public (1 policy) ---

DROP POLICY IF EXISTS "profiles_public_select_team_coach" ON public.profiles_public;
CREATE POLICY "profiles_public_select_team_coach"
  ON public.profiles_public
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT s.user_id
      FROM public.subscriptions s
      INNER JOIN public.coach_teams ct ON s.team_id = ct.id
      WHERE ct.coach_id = (select auth.uid())
        AND s.status IN ('pending', 'active', 'past_due')
    )
  );

-- --- waitlist_settings (2 policies) ---

DROP POLICY IF EXISTS "Admins can update waitlist settings" ON waitlist_settings;
CREATE POLICY "Admins can update waitlist settings"
  ON waitlist_settings FOR UPDATE
  TO authenticated
  USING (has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS "Admins can insert waitlist settings" ON waitlist_settings;
CREATE POLICY "Admins can insert waitlist settings"
  ON waitlist_settings FOR INSERT
  TO authenticated
  WITH CHECK (has_role((select auth.uid()), 'admin'));


-- ============================================================================
-- PART 2: Drop 2 duplicate indexes (identical copies, one is redundant)
-- ============================================================================

DROP INDEX IF EXISTS idx_template_days_program;          -- duplicate of idx_program_template_days_template
DROP INDEX IF EXISTS idx_client_days_program;             -- duplicate of idx_client_program_days_program


-- ============================================================================
-- PART 3: Drop unused indexes on audit/log/event tables
-- These are write-heavy, append-only tables rarely queried interactively.
-- Removing these indexes reduces write IO overhead significantly.
-- ============================================================================

-- admin_audit_log (4 indexes, write-heavy audit trail)
DROP INDEX IF EXISTS idx_admin_audit_log_created_at;
DROP INDEX IF EXISTS idx_admin_audit_log_target;
DROP INDEX IF EXISTS idx_admin_audit_log_admin;
DROP INDEX IF EXISTS idx_admin_audit_log_target_type;

-- phi_access_audit_log (4 indexes, HIPAA audit trail — rarely queried)
DROP INDEX IF EXISTS idx_phi_access_audit_actor;
DROP INDEX IF EXISTS idx_phi_access_audit_target;
DROP INDEX IF EXISTS idx_phi_access_audit_occurred;
DROP INDEX IF EXISTS idx_phi_access_audit_action;

-- phi_access_log (4 indexes)
DROP INDEX IF EXISTS idx_phi_access_log_user_id;
DROP INDEX IF EXISTS idx_phi_access_log_target_user_id;
DROP INDEX IF EXISTS idx_phi_access_log_created_at;
DROP INDEX IF EXISTS idx_phi_access_log_action_type;

-- phi_audit_log (2 indexes)
DROP INDEX IF EXISTS idx_phi_audit_log_created;
DROP INDEX IF EXISTS idx_phi_audit_log_event;

-- payment_webhook_events (3 indexes, event log from Tap)
DROP INDEX IF EXISTS idx_payment_webhook_events_charge_id;
DROP INDEX IF EXISTS idx_payment_webhook_events_received_at;
DROP INDEX IF EXISTS idx_payment_webhook_events_verification;

-- payment_events (3 indexes, processed payment event log)
DROP INDEX IF EXISTS idx_payment_events_provider_event;
DROP INDEX IF EXISTS idx_payment_events_charge_id;
DROP INDEX IF EXISTS idx_payment_events_occurred_at;

-- subscription_payments (5 indexes, payment history log)
DROP INDEX IF EXISTS idx_subscription_payments_subscription_id;
DROP INDEX IF EXISTS idx_subscription_payments_user_id;
DROP INDEX IF EXISTS idx_subscription_payments_tap_charge_id;
DROP INDEX IF EXISTS idx_subscription_payments_status;
DROP INDEX IF EXISTS idx_subscription_payments_created_at;

-- video_access_log (3 indexes, video view tracking)
DROP INDEX IF EXISTS idx_video_access_log_user;
DROP INDEX IF EXISTS idx_video_access_log_video;
DROP INDEX IF EXISTS idx_video_access_log_denied;

-- discount_validation_log (1 index, discount attempt log)
DROP INDEX IF EXISTS idx_discount_validation_log_user_time;

-- coach_payment_history (2 indexes, payment history)
DROP INDEX IF EXISTS idx_coach_payment_history_action_type;
DROP INDEX IF EXISTS idx_coach_payment_history_created_at;

-- ============================================================================
-- Total: 28 RLS policies fixed + 2 duplicate indexes dropped + 31 audit indexes dropped
-- ============================================================================
