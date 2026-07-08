-- P0: SECURITY DEFINER functions with `SET search_path TO ''` that reference
-- public relations UNqualified in their body → 42P01 "relation does not exist".
-- The June search-path-hardening sweep set search_path='' but left some bodies
-- unqualified. Fix = keep search_path='' (good practice) and schema-qualify refs.
--
-- Audit (2026-07-08): only 4 public SECURITY DEFINER functions use search_path='';
-- ensure_default_client_role + get_my_roles are already public-qualified (fine).
-- The two below were broken. All other 189 SECURITY DEFINER functions use
-- search_path=public[, extensions] so their unqualified refs resolve normally.

-- 1) sync_form_submissions_safe — AFTER trigger on public.form_submissions.
--    Broke EVERY insert/update/delete on form_submissions (blocks onboarding).
--    Verbatim body; only the 3 form_submissions_safe refs are now qualified.
CREATE OR REPLACE FUNCTION public.sync_form_submissions_safe()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.form_submissions_safe (
      id, user_id, created_at, updated_at, needs_medical_review,
      verified_at, verified_by_coach_id, documents_verified,
      documents_approved_by_coach, documents_approved_at,
      coach_preference_type, requested_coach_id, submission_status,
      red_flags_count, service_id, notes_summary
    ) VALUES (
      NEW.id, NEW.user_id, NEW.created_at, NEW.updated_at, NEW.needs_medical_review,
      NEW.verified_at, NEW.verified_by_coach_id, NEW.documents_verified,
      NEW.documents_approved_by_coach, NEW.documents_approved_at,
      NEW.coach_preference_type, NEW.requested_coach_id, NEW.submission_status,
      0,    -- red_flags_count not on form_submissions, default to 0
      NULL, -- service_id pulled from subscriptions, not form_submissions
      NULL  -- notes_summary not populated from form_submissions
    );
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.form_submissions_safe SET
      user_id = NEW.user_id,
      updated_at = NEW.updated_at,
      needs_medical_review = NEW.needs_medical_review,
      verified_at = NEW.verified_at,
      verified_by_coach_id = NEW.verified_by_coach_id,
      documents_verified = NEW.documents_verified,
      documents_approved_by_coach = NEW.documents_approved_by_coach,
      documents_approved_at = NEW.documents_approved_at,
      coach_preference_type = NEW.coach_preference_type,
      requested_coach_id = NEW.requested_coach_id,
      submission_status = NEW.submission_status,
      red_flags_count = 0
    WHERE id = NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.form_submissions_safe WHERE id = OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) bootstrap_admin — same latent bug (dead once an admin exists, but its very
--    first statement `FROM user_roles` would 42P01). Verbatim body; user_roles
--    and admin_audit_log refs are now schema-qualified.
CREATE OR REPLACE FUNCTION public.bootstrap_admin(admin_email text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  target_user_id UUID;
  existing_admin_count INT;
BEGIN
  -- Safety check: Only allow if NO admins exist yet
  SELECT COUNT(*) INTO existing_admin_count
  FROM public.user_roles
  WHERE role = 'admin';

  IF existing_admin_count > 0 THEN
    RETURN 'ERROR: Admin already exists. Use the admin dashboard to create new admins.';
  END IF;

  -- Find user by email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = admin_email;

  IF target_user_id IS NULL THEN
    RETURN 'ERROR: User not found. Please sign up first at theigu.com/auth';
  END IF;

  -- Grant admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (target_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Log this action
  INSERT INTO public.admin_audit_log (admin_user_id, action, target_user_id, details)
  VALUES (target_user_id, 'BOOTSTRAP_ADMIN', target_user_id,
    jsonb_build_object('email', admin_email, 'method', 'bootstrap_function'));

  RETURN 'SUCCESS: Admin role granted to ' || admin_email;
END;
$function$;
