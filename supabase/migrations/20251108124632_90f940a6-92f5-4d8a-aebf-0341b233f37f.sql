-- Make handle_new_user idempotent to prevent duplicate key errors on profiles_pkey
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Insert or update profile for new user without causing duplicate key violation
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    'pending'::account_status
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', public.profiles.full_name),
    updated_at = now();

  RETURN NEW;
END;
$function$;