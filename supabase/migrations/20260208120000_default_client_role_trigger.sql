-- Safety net: ensure every new auth user eventually gets the 'client' role
-- if no role is assigned after onboarding submission.
--
-- The submit-onboarding edge function already assigns roles,
-- but this trigger covers edge cases (manual account creation,
-- race conditions, failed edge function calls).

CREATE OR REPLACE FUNCTION public.ensure_default_client_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act when status transitions TO an onboarding-complete state
  -- and user has NO role yet
  IF NEW.status IN ('pending_coach_approval', 'pending_payment', 'needs_medical_review', 'active')
    AND (OLD.status IS NULL OR OLD.status IN ('new', 'pending'))
  THEN
    -- Check if user already has a role
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles WHERE user_id = NEW.id
    ) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.id, 'client')
      ON CONFLICT (user_id, role) DO NOTHING;

      RAISE LOG 'ensure_default_client_role: assigned client role to user %', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on profiles_public status changes (set during onboarding)
DROP TRIGGER IF EXISTS trg_ensure_default_client_role ON public.profiles_public;
CREATE TRIGGER trg_ensure_default_client_role
  AFTER UPDATE OF status ON public.profiles_public
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_default_client_role();
