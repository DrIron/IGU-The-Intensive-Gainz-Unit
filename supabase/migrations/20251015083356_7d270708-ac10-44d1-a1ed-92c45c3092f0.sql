-- Create function to clean up user_roles when a coach is deleted
CREATE OR REPLACE FUNCTION cleanup_coach_user_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete the coach role for this user
  DELETE FROM public.user_roles
  WHERE user_id = OLD.user_id AND role = 'coach';
  
  RETURN OLD;
END;
$$;

-- Create trigger to automatically clean up user_roles when coach is deleted
DROP TRIGGER IF EXISTS cleanup_coach_role_on_delete ON public.coaches;
CREATE TRIGGER cleanup_coach_role_on_delete
  BEFORE DELETE ON public.coaches
  FOR EACH ROW
  EXECUTE FUNCTION cleanup_coach_user_role();