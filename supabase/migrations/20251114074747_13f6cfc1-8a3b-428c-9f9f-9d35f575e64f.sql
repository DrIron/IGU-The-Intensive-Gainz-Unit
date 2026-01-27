
-- Create trigger function to auto-assign member role to payment_exempt users
CREATE OR REPLACE FUNCTION public.assign_member_to_payment_exempt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If user is being marked as payment_exempt and doesn't have member role yet
  IF NEW.payment_exempt = true AND (OLD.payment_exempt IS NULL OR OLD.payment_exempt = false) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'member'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on profiles table
CREATE TRIGGER on_payment_exempt_set
  AFTER INSERT OR UPDATE OF payment_exempt ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_member_to_payment_exempt();
