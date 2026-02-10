-- Fix Security Advisor warnings: Function Search Path Mutable
-- Sets search_path to empty string on all 7 flagged functions to prevent
-- schema hijacking attacks where a malicious user creates objects in a
-- schema that shadows the public schema.

ALTER FUNCTION public.update_site_content_timestamp() SET search_path = '';
ALTER FUNCTION public.sync_form_submissions_safe() SET search_path = '';
ALTER FUNCTION public.bootstrap_admin(admin_email text) SET search_path = '';
ALTER FUNCTION public.get_my_roles() SET search_path = '';
ALTER FUNCTION public.ensure_default_client_role() SET search_path = '';
ALTER FUNCTION public.deactivate_old_step_recommendations() SET search_path = '';
ALTER FUNCTION public.update_specialization_tags_updated_at() SET search_path = '';
