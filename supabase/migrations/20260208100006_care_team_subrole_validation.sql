-- ============================================================
-- Phase 26: Care Team Validation Trigger
-- Validates that staff have the required subrole for their specialty
-- ============================================================

CREATE OR REPLACE FUNCTION public.validate_care_team_subrole()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only validate on INSERT or when specialty changes
  -- Skip validation for admins (they can assign anyone)
  IF public.is_admin(NEW.added_by) OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Map specialty to required subrole
  -- Only certain specialties require a specific subrole
  CASE NEW.specialty::text
    WHEN 'dietitian' THEN
      IF NOT public.has_approved_subrole(NEW.staff_user_id, 'dietitian') THEN
        RAISE EXCEPTION 'Staff member does not have approved dietitian subrole';
      END IF;
    WHEN 'physiotherapy' THEN
      IF NOT public.has_approved_subrole(NEW.staff_user_id, 'physiotherapist') THEN
        RAISE EXCEPTION 'Staff member does not have approved physiotherapist subrole';
      END IF;
    WHEN 'mobility' THEN
      IF NOT public.has_approved_subrole(NEW.staff_user_id, 'mobility_coach') THEN
        RAISE EXCEPTION 'Staff member does not have approved mobility_coach subrole';
      END IF;
    ELSE
      -- Other specialties (nutrition, lifestyle, bodybuilding, powerlifting, running, calisthenics)
      -- only need the base 'coach' role, no specific subrole required
      IF NOT public.has_role(NEW.staff_user_id, 'coach'::app_role) THEN
        RAISE EXCEPTION 'Staff member must have coach role';
      END IF;
  END CASE;

  RETURN NEW;
END;
$$;

-- Create trigger (only on INSERT to avoid breaking existing assignments)
DROP TRIGGER IF EXISTS trg_validate_care_team_subrole ON public.care_team_assignments;
CREATE TRIGGER trg_validate_care_team_subrole
  BEFORE INSERT ON public.care_team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_care_team_subrole();
