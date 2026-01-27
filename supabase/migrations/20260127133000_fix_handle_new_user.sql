-- Fix handle_new_user to properly handle first_name + last_name from signup metadata
-- The Auth.tsx sends first_name and last_name separately, not full_name

-- Step 1: Add policies that allow service_role to insert (for auth triggers)
DROP POLICY IF EXISTS "Service role can insert profiles_public" ON public.profiles_public;
CREATE POLICY "Service role can insert profiles_public"
ON public.profiles_public FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can insert profiles_private" ON public.profiles_private;
CREATE POLICY "Service role can insert profiles_private"
ON public.profiles_private FOR INSERT
TO service_role
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update profiles_public" ON public.profiles_public;
CREATE POLICY "Service role can update profiles_public"
ON public.profiles_public FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update profiles_private" ON public.profiles_private;
CREATE POLICY "Service role can update profiles_private"
ON public.profiles_private FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- Step 2: Recreate the function with proper handling
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
DECLARE
  v_first_name text;
  v_last_name text;
  v_display_name text;
BEGIN
  -- Extract first_name and last_name from metadata (Auth.tsx sends these separately)
  v_first_name := COALESCE(
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'full_name',
    ''
  );
  
  v_last_name := COALESCE(
    NEW.raw_user_meta_data->>'last_name',
    ''
  );
  
  -- Build display name from first + last, or just first if no last
  v_display_name := TRIM(CONCAT(v_first_name, ' ', v_last_name));
  IF v_display_name = '' THEN
    v_display_name := NULL;
  END IF;

  -- Insert into profiles_public
  INSERT INTO public.profiles_public (id, first_name, display_name, status)
  VALUES (
    NEW.id, 
    NULLIF(v_first_name, ''),
    v_display_name, 
    'pending'::account_status
  )
  ON CONFLICT (id) DO UPDATE SET
    first_name = COALESCE(NULLIF(v_first_name, ''), profiles_public.first_name),
    display_name = COALESCE(v_display_name, profiles_public.display_name),
    updated_at = now();

  -- Insert into profiles_private (with last_name)
  INSERT INTO public.profiles_private (profile_id, email, full_name, last_name)
  VALUES (
    NEW.id, 
    NEW.email, 
    v_display_name,
    NULLIF(v_last_name, '')
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(v_display_name, profiles_private.full_name),
    last_name = COALESCE(NULLIF(v_last_name, ''), profiles_private.last_name),
    updated_at = now();
    
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error for debugging but don't block user creation
    RAISE WARNING 'handle_new_user failed for user %: % %', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
