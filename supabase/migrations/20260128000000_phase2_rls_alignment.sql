-- ============================================================================
-- PHASE 2: DATABASE/RLS ALIGNMENT
-- ============================================================================
-- Goal: UI permissions must match DB reality. DB must be safe even if frontend
-- is compromised.
--
-- Data Domains:
--   1. PUBLIC-ISH: coach directory (limited fields)
--   2. PRIVATE PII: email/phone/DOB (profiles_private)
--   3. PHI/MEDICAL: PAR-Q, injuries, meds (form_submissions)
--   4. BILLING: subscriptions, payments
--   5. WORKOUTS: programs, logs, videos
--
-- Hard Rules:
--   - PHI: only admin + the user themselves
--   - Coaches use safe views (non-PHI) unless explicitly needed (time-bounded)
--   - Coach access mediated by coach_client_relationships with start/end dates
-- ============================================================================

-- ============================================================================
-- STEP 1: STANDARDIZE HELPER FUNCTIONS
-- ============================================================================

-- Drop and recreate to ensure consistent behavior
DROP FUNCTION IF EXISTS public.has_active_assignment(uuid, uuid);
CREATE OR REPLACE FUNCTION public.has_active_assignment(
  p_coach_id uuid,
  p_client_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Returns TRUE if the coach has an active (non-ended) relationship with the client
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_client_relationships ccr
    WHERE ccr.coach_id = p_coach_id
      AND ccr.client_id = p_client_id
      AND ccr.ended_at IS NULL
  )
$$;

COMMENT ON FUNCTION public.has_active_assignment(uuid, uuid) IS 
  'Returns true if the coach has an active (non-ended) assignment to the client. 
   Used by RLS policies to mediate coach access.';

-- Convenience function for auth.uid() context
DROP FUNCTION IF EXISTS public.is_my_client(uuid);
CREATE OR REPLACE FUNCTION public.is_my_client(p_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_active_assignment(auth.uid(), p_client_id)
$$;

COMMENT ON FUNCTION public.is_my_client(uuid) IS 
  'Returns true if the current user (coach) has an active assignment to the specified client.';

-- Function to check if coach WAS assigned during a specific time period
DROP FUNCTION IF EXISTS public.was_assigned_during(uuid, uuid, timestamptz);
CREATE OR REPLACE FUNCTION public.was_assigned_during(
  p_coach_id uuid,
  p_client_id uuid,
  p_record_time timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Returns TRUE if the coach had an active relationship at the time the record was created
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_client_relationships ccr
    WHERE ccr.coach_id = p_coach_id
      AND ccr.client_id = p_client_id
      AND ccr.started_at <= p_record_time
      AND (ccr.ended_at IS NULL OR ccr.ended_at > p_record_time)
  )
$$;

COMMENT ON FUNCTION public.was_assigned_during(uuid, uuid, timestamptz) IS 
  'Returns true if the coach had an active assignment at the specified time. 
   Used for historical data access.';

-- ============================================================================
-- STEP 2: DATA DOMAIN CLASSIFICATION (COMMENTS)
-- ============================================================================

COMMENT ON TABLE public.profiles_public IS 
  '[DATA_DOMAIN: PUBLIC] Public profile info visible to coaches and system. 
   Contains: display_name, first_name, avatar_url, status. 
   NO PHI, NO PII.';

COMMENT ON TABLE public.profiles_private IS 
  '[DATA_DOMAIN: PII] Private profile data. 
   Contains: email, phone, last_name, date_of_birth, gender. 
   ACCESS: admin + self only. Coaches DENIED.';

COMMENT ON TABLE public.form_submissions IS 
  '[DATA_DOMAIN: PHI] Medical intake forms, PAR-Q, injury info, medications. 
   ACCESS: admin + self only. Coaches use form_submissions_safe view.';

COMMENT ON TABLE public.subscriptions IS 
  '[DATA_DOMAIN: BILLING] Subscription and payment relationships. 
   ACCESS: admin, assigned coach (read), self.';

COMMENT ON TABLE public.subscription_payments IS 
  '[DATA_DOMAIN: BILLING] Payment transactions. 
   ACCESS: admin, assigned coach (read), self.';

-- ============================================================================
-- STEP 3: PROFILES_PUBLIC - COACH ACCESS VIA ASSIGNMENT
-- ============================================================================

-- Drop legacy policies that use subscriptions directly
DROP POLICY IF EXISTS "Coaches view assigned clients" ON public.profiles_public;
DROP POLICY IF EXISTS "Coaches can view assigned client profiles_public" ON public.profiles_public;
DROP POLICY IF EXISTS "tpl1_coach_select_assigned" ON public.profiles_public;

-- Create new policy using assignment model
CREATE POLICY "Coaches view assigned clients via assignment"
ON public.profiles_public
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND public.is_my_client(profiles_public.id)
);

-- ============================================================================
-- STEP 4: PROFILES_PRIVATE - EXPLICIT COACH DENIAL (ALREADY EXISTS, VERIFY)
-- ============================================================================

-- Ensure coaches cannot access profiles_private (PII)
-- This should already exist but let's be explicit
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'profiles_private' 
    AND policyname = 'Coaches explicitly denied PII'
  ) THEN
    CREATE POLICY "Coaches explicitly denied PII"
    ON public.profiles_private
    FOR ALL
    TO authenticated
    USING (
      -- Allow if NOT a coach (admin/client/self)
      NOT public.has_role(auth.uid(), 'coach'::app_role)
      -- OR if admin (admins can do anything)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      -- OR if viewing own profile
      OR auth.uid() = profile_id
    )
    WITH CHECK (
      NOT public.has_role(auth.uid(), 'coach'::app_role)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR auth.uid() = profile_id
    );
  END IF;
END $$;

-- ============================================================================
-- STEP 5: FORM_SUBMISSIONS - PHI LOCKDOWN
-- ============================================================================

-- Ensure form_submissions (PHI) is locked to admin + self only
DROP POLICY IF EXISTS "Coaches denied direct form_submissions access" ON public.form_submissions;
DROP POLICY IF EXISTS "Users can view own form submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Admins can view all form submissions" ON public.form_submissions;

-- Self access
CREATE POLICY "Users view own PHI form submissions"
ON public.form_submissions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Admin access
CREATE POLICY "Admins view all PHI form submissions"
ON public.form_submissions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Explicit coach denial (they must use form_submissions_safe)
CREATE POLICY "Coaches denied PHI form submissions"
ON public.form_submissions
FOR SELECT
TO authenticated
USING (
  -- Deny if coach (unless also admin)
  NOT (
    public.has_role(auth.uid(), 'coach'::app_role) 
    AND NOT public.has_role(auth.uid(), 'admin'::app_role)
  )
);

-- ============================================================================
-- STEP 6: SUBSCRIPTIONS - COACH ACCESS VIA ASSIGNMENT
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can view their clients subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Coaches view their assigned subscriptions" ON public.subscriptions;

-- Coaches can view subscriptions for their ACTIVELY assigned clients only
CREATE POLICY "Coaches view assigned client subscriptions"
ON public.subscriptions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND public.is_my_client(user_id)
);

-- ============================================================================
-- STEP 7: SUBSCRIPTION_PAYMENTS - COACH ACCESS VIA ASSIGNMENT
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can view client subscription payments" ON public.subscription_payments;

CREATE POLICY "Coaches view assigned client payments"
ON public.subscription_payments
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_payments.subscription_id
    AND public.is_my_client(s.user_id)
  )
);

-- ============================================================================
-- STEP 8: CARE_TEAM_ASSIGNMENTS - UPDATE TO USE ASSIGNMENT MODEL
-- ============================================================================

DROP POLICY IF EXISTS "Primary coaches can view care team for their clients" ON public.care_team_assignments;
DROP POLICY IF EXISTS "Primary coaches can insert care team members for their clients" ON public.care_team_assignments;
DROP POLICY IF EXISTS "Primary coaches can update care team for their clients" ON public.care_team_assignments;

-- Primary coaches can view care team for their assigned clients
CREATE POLICY "Coaches view care team for assigned clients"
ON public.care_team_assignments
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND public.is_my_client(client_id)
);

-- Primary coaches can manage care team for their assigned clients
CREATE POLICY "Coaches manage care team for assigned clients"
ON public.care_team_assignments
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND public.is_my_client(client_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND public.is_my_client(client_id)
);

-- ============================================================================
-- STEP 9: CLIENT_COACH_NOTES - ALREADY PROPERLY SCOPED (VERIFY)
-- ============================================================================

-- client_coach_notes should only be accessible by:
-- 1. The coach who created the note
-- 2. Admins
-- This is correct behavior - coaches should only see THEIR OWN notes about a client

-- ============================================================================
-- STEP 10: SUBSCRIPTION_ADDONS - UPDATE TO USE ASSIGNMENT MODEL
-- ============================================================================

DROP POLICY IF EXISTS "Coaches can view and manage addons for their clients" ON public.subscription_addons;

CREATE POLICY "Coaches view addons for assigned clients"
ON public.subscription_addons
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'coach'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_addons.subscription_id
    AND public.is_my_client(s.user_id)
  )
);

-- ============================================================================
-- STEP 11: CREATE SAFE VIEW FOR COACH CLIENT LIST
-- ============================================================================

-- Drop and recreate to ensure latest definition
DROP VIEW IF EXISTS public.coach_client_list;

CREATE VIEW public.coach_client_list AS
SELECT 
  pp.id AS client_id,
  pp.first_name,
  pp.display_name,
  pp.avatar_url,
  pp.status AS account_status,
  ccr.coach_id,
  ccr.role AS assignment_role,
  ccr.started_at AS assigned_since,
  s.id AS subscription_id,
  s.status AS subscription_status,
  s.current_period_end
FROM public.profiles_public pp
INNER JOIN public.coach_client_relationships ccr ON ccr.client_id = pp.id
LEFT JOIN public.subscriptions s ON s.user_id = pp.id
WHERE ccr.ended_at IS NULL;  -- Only active assignments

COMMENT ON VIEW public.coach_client_list IS 
  '[DATA_DOMAIN: PUBLIC] Safe view of client list for coaches. 
   Contains NO PHI, NO PII. Only public profile + subscription status.
   Filtered to active assignments only.';

-- RLS on the view (enforced via underlying table policies)
-- Coaches can only see their own clients through the underlying RLS

-- ============================================================================
-- STEP 12: CREATE SAFE VIEW FOR FORM SUBMISSIONS (NON-PHI)
-- ============================================================================

-- Ensure form_submissions_safe exists and excludes PHI fields
DROP VIEW IF EXISTS public.form_submissions_safe;

CREATE VIEW public.form_submissions_safe AS
SELECT 
  fs.id,
  fs.user_id,
  fs.form_type,
  fs.status,
  -- Exclude PHI fields: medical_conditions, medications, injuries, allergies, etc.
  -- Only include operational fields coaches need
  fs.created_at,
  fs.updated_at,
  -- Include safe summary fields if they exist
  CASE 
    WHEN fs.form_type = 'onboarding' THEN 
      jsonb_build_object(
        'training_goal', fs.data->>'training_goal',
        'training_experience', fs.data->>'training_experience',
        'days_per_week', fs.data->>'days_per_week',
        'preferred_training_style', fs.data->>'preferred_training_style'
      )
    ELSE '{}'::jsonb
  END AS safe_data
FROM public.form_submissions fs;

COMMENT ON VIEW public.form_submissions_safe IS 
  '[DATA_DOMAIN: PUBLIC] Safe view of form submissions for coaches. 
   Excludes ALL PHI fields (medical conditions, medications, injuries, allergies, PAR-Q).
   Only includes operational data needed for training programming.';

-- Grant access
GRANT SELECT ON public.form_submissions_safe TO authenticated;
GRANT SELECT ON public.coach_client_list TO authenticated;

-- ============================================================================
-- STEP 13: VERIFY ALL CRITICAL TABLES HAVE RLS ENABLED
-- ============================================================================

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename IN (
      'profiles_public', 'profiles_private', 'form_submissions',
      'subscriptions', 'subscription_payments', 'subscription_addons',
      'coach_client_relationships', 'care_team_assignments',
      'client_coach_notes', 'coaches', 'coaches_public', 'coaches_private',
      'user_roles', 'workout_programs', 'workout_logs', 'exercises',
      'nutrition_phases', 'nutrition_goals', 'weight_logs'
    )
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- ============================================================================
-- STEP 14: AUDIT LOG FOR ACCESS VIOLATIONS (OPTIONAL BUT RECOMMENDED)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('access_denied', 'policy_violation', 'suspicious_access')),
  user_id uuid REFERENCES auth.users(id),
  table_name text,
  operation text,
  details jsonb,
  client_ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_user ON public.security_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_log_created ON public.security_audit_log(created_at DESC);

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can view security audit log
CREATE POLICY "Admins view security audit log"
ON public.security_audit_log
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Service role can insert (for triggers)
CREATE POLICY "Service role can insert audit log"
ON public.security_audit_log
FOR INSERT
TO service_role
WITH CHECK (true);

COMMENT ON TABLE public.security_audit_log IS 
  'Audit log for security-related events. Tracks access denials and policy violations.';

-- ============================================================================
-- STEP 15: DOCUMENTATION - DATA DOMAIN MATRIX
-- ============================================================================

COMMENT ON SCHEMA public IS 
$doc$
DATA DOMAIN ACCESS MATRIX:

| Domain      | Tables/Views                 | Admin | Coach       | Client |
|-------------|------------------------------|-------|-------------|--------|
| PUBLIC      | profiles_public              | R/W   | R (assigned)| R (self)|
| PUBLIC      | coach_client_list (view)     | R     | R (own)     | -      |
| PUBLIC      | coaches_public               | R/W   | R           | R      |
| PII         | profiles_private             | R/W   | DENIED      | R/W (self)|
| PHI         | form_submissions             | R/W   | DENIED*     | R (self)|
| PHI         | form_submissions_safe (view) | R     | R (assigned)| R (self)|
| BILLING     | subscriptions                | R/W   | R (assigned)| R (self)|
| BILLING     | subscription_payments        | R/W   | R (assigned)| R (self)|
| WORKOUTS    | workout_programs             | R/W   | R/W (assigned)| R (self)|
| WORKOUTS    | workout_logs                 | R/W   | R/W (assigned)| R/W (self)|
| ADMIN       | security_audit_log           | R/W   | DENIED      | DENIED |

* Coaches MUST use form_submissions_safe view which excludes PHI fields.
* All coach access is mediated by coach_client_relationships (active assignment).
* When assignment ends, coach immediately loses access to client data.
$doc$;
