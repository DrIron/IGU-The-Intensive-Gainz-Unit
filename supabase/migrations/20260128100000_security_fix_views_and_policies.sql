-- ============================================================
-- CRITICAL SECURITY FIX MIGRATION
-- IGU Platform - Fix View RLS Bypass & Overly Permissive Policies
-- 
-- WHAT THIS FIXES:
-- 1. form_submissions_decrypted view bypasses RLS (exposes PHI)
-- 2. profiles view bypasses RLS (exposes private user data)
-- 3. coaches_full view bypasses RLS (exposes private coach data)
-- 4. coaches_directory_admin view bypasses RLS
-- 5. educational_videos policy too permissive
-- 6. discount_codes policy too permissive
-- ============================================================

-- ============================================================
-- PART 1: FIX form_submissions_decrypted VIEW (CRITICAL)
-- ============================================================

DROP VIEW IF EXISTS form_submissions_decrypted;

-- Create secure function that checks permissions before returning decrypted data
CREATE OR REPLACE FUNCTION get_decrypted_form_submission(submission_id UUID)
RETURNS TABLE (
    id UUID,
    form_type TEXT,
    user_id UUID,
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone_number TEXT,
    date_of_birth DATE,
    parq_heart_condition BOOLEAN,
    parq_chest_pain_active BOOLEAN,
    parq_chest_pain_inactive BOOLEAN,
    parq_balance_dizziness BOOLEAN,
    parq_bone_joint_problem BOOLEAN,
    parq_medication BOOLEAN,
    parq_other_reason BOOLEAN,
    parq_injuries_conditions TEXT,
    parq_additional_details TEXT,
    training_goals TEXT,
    training_experience TEXT,
    plan_name TEXT,
    submission_status TEXT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- STRICT ACCESS CHECK: Only admin or the user themselves
    IF NOT (
        has_role(auth.uid(), 'admin'::app_role) 
        OR auth.uid() = (SELECT fs.user_id FROM form_submissions fs WHERE fs.id = submission_id)
    ) THEN
        RAISE EXCEPTION 'Access denied: You do not have permission to view this submission';
    END IF;

    -- Log PHI access for audit trail
    INSERT INTO phi_access_audit_log (
        accessed_by_user_id,
        accessed_user_id,
        table_name,
        record_id,
        access_type,
        access_reason,
        accessed_at
    )
    SELECT 
        auth.uid(),
        fs.user_id,
        'form_submissions',
        submission_id,
        'SELECT',
        'Decrypted form submission access via secure function',
        NOW()
    FROM form_submissions fs
    WHERE fs.id = submission_id;

    -- Return decrypted data
    RETURN QUERY
    SELECT 
        fs.id,
        fs.form_type,
        fs.user_id,
        fs.first_name,
        fs.last_name,
        decrypt_phi_text(fs.email_encrypted),
        decrypt_phi_text(fs.phone_number_encrypted),
        decrypt_phi_date(fs.date_of_birth_encrypted),
        decrypt_phi_boolean(fs.parq_heart_condition_encrypted),
        decrypt_phi_boolean(fs.parq_chest_pain_active_encrypted),
        decrypt_phi_boolean(fs.parq_chest_pain_inactive_encrypted),
        decrypt_phi_boolean(fs.parq_balance_dizziness_encrypted),
        decrypt_phi_boolean(fs.parq_bone_joint_problem_encrypted),
        decrypt_phi_boolean(fs.parq_medication_encrypted),
        decrypt_phi_boolean(fs.parq_other_reason_encrypted),
        decrypt_phi_text(fs.parq_injuries_conditions_encrypted),
        decrypt_phi_text(fs.parq_additional_details_encrypted),
        fs.training_goals,
        fs.training_experience,
        fs.plan_name,
        fs.submission_status,
        fs.created_at
    FROM form_submissions fs
    WHERE fs.id = submission_id;
END;
$$;

REVOKE ALL ON FUNCTION get_decrypted_form_submission(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_decrypted_form_submission(UUID) TO authenticated;

-- ============================================================
-- PART 2: FIX profiles VIEW
-- ============================================================

DROP VIEW IF EXISTS profiles;

CREATE VIEW profiles 
WITH (security_invoker = true)
AS
SELECT 
    pp.id,
    priv.email,
    priv.full_name,
    priv.phone,
    pp.status,
    pp.created_at,
    pp.updated_at,
    pp.payment_deadline,
    pp.signup_completed_at,
    pp.onboarding_completed_at,
    pp.activation_completed_at,
    pp.first_name,
    priv.last_name,
    priv.date_of_birth,
    priv.gender,
    pp.payment_exempt,
    pp.display_name,
    pp.avatar_url
FROM profiles_public pp
LEFT JOIN profiles_private priv ON pp.id = priv.profile_id;

GRANT SELECT ON profiles TO authenticated;

-- ============================================================
-- PART 3: FIX coaches_full VIEW
-- ============================================================

DROP VIEW IF EXISTS coaches_full;

CREATE VIEW coaches_full
WITH (security_invoker = true)
AS
SELECT 
    cp.id,
    cp.user_id,
    cp.first_name,
    cp.last_name,
    cp.nickname,
    cp.display_name,
    cp.bio,
    cp.short_bio,
    cp.location,
    cp.profile_picture_url,
    cp.qualifications,
    cp.specializations,
    cp.specialties,
    cp.status,
    cp.max_onetoone_clients,
    cp.max_team_clients,
    cp.last_assigned_at,
    cp.created_at,
    cp.updated_at,
    cpriv.email,
    cpriv.phone,
    cpriv.whatsapp_number,
    cpriv.date_of_birth,
    cpriv.gender,
    cpriv.instagram_url,
    cpriv.tiktok_url,
    cpriv.snapchat_url,
    cpriv.youtube_url
FROM coaches_public cp
LEFT JOIN coaches_private cpriv ON cp.id = cpriv.coach_public_id;

GRANT SELECT ON coaches_full TO authenticated;

-- ============================================================
-- PART 4: FIX coaches_directory_admin VIEW
-- ============================================================

DROP VIEW IF EXISTS coaches_directory_admin;

CREATE VIEW coaches_directory_admin
WITH (security_invoker = true)
AS
SELECT 
    cp.id,
    cp.user_id,
    cp.first_name,
    cp.last_name,
    cp.display_name,
    cp.nickname,
    cp.bio,
    cp.short_bio,
    cp.location,
    cp.profile_picture_url,
    cp.qualifications,
    cp.specializations,
    cp.specialties,
    cp.status,
    cp.max_onetoone_clients,
    cp.max_team_clients,
    cp.last_assigned_at,
    cp.instagram_url,
    cp.tiktok_url,
    cp.youtube_url,
    cp.created_at,
    cp.updated_at,
    cpriv.email,
    cpriv.phone,
    cpriv.whatsapp_number,
    cpriv.date_of_birth,
    cpriv.gender,
    cpriv.snapchat_url
FROM coaches_public cp
LEFT JOIN coaches_private cpriv ON cp.id = cpriv.coach_public_id
WHERE cp.status = 'active';

GRANT SELECT ON coaches_directory_admin TO authenticated;

-- ============================================================
-- PART 5: FIX coaches_directory VIEW
-- ============================================================

DROP VIEW IF EXISTS coaches_directory;

CREATE VIEW coaches_directory
WITH (security_invoker = true)
AS
SELECT 
    user_id,
    first_name,
    last_name,
    nickname,
    display_name,
    short_bio,
    bio,
    profile_picture_url,
    qualifications,
    specializations,
    specialties,
    location,
    status
FROM coaches_public cp
WHERE status = 'active';

GRANT SELECT ON coaches_directory TO authenticated;

-- ============================================================
-- PART 6: FIX coaches_client_safe VIEW
-- ============================================================

DROP VIEW IF EXISTS coaches_client_safe;

CREATE VIEW coaches_client_safe
WITH (security_invoker = true)
AS
SELECT 
    id,
    user_id,
    first_name,
    last_name,
    profile_picture_url,
    short_bio,
    specializations,
    status
FROM coaches c
WHERE status = 'active';

GRANT SELECT ON coaches_client_safe TO authenticated;

-- ============================================================
-- PART 7: FIX educational_videos POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Authenticated users can view educational videos" ON educational_videos;
DROP POLICY IF EXISTS "tpl4_authenticated_select" ON educational_videos;

-- ============================================================
-- PART 8: FIX discount_codes POLICIES
-- ============================================================

DROP POLICY IF EXISTS "tpl4_authenticated_select" ON discount_codes;