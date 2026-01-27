
-- ============================================================
-- Harden coach data isolation: coaches_public vs coaches_private
-- ============================================================

-- STEP 1: Restrict legacy 'coaches' table to admin-only
-- Coaches should use coaches_public for their profile data
DROP POLICY IF EXISTS "Coaches can view own profile" ON public.coaches;
DROP POLICY IF EXISTS "Coaches can update own profile limited fields" ON public.coaches;
DROP POLICY IF EXISTS "coaches_admin_or_self_select" ON public.coaches;

-- Only admins can access the legacy coaches table
-- (coaches_public is the proper table for coach profile access)
CREATE POLICY "coaches_admin_only"
ON public.coaches
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- STEP 2: Ensure coaches_public is readable by ALL authenticated users
-- Drop existing SELECT policies that may be too restrictive
DROP POLICY IF EXISTS "Authenticated users can view active coaches" ON public.coaches_public;
DROP POLICY IF EXISTS "Coaches can view own profile" ON public.coaches_public;

-- All authenticated users can view coaches_public (for coach selection, directory, etc.)
CREATE POLICY "coaches_public_authenticated_select"
ON public.coaches_public
FOR SELECT
TO authenticated
USING (true);

-- Coaches can update their own public profile
DROP POLICY IF EXISTS "Coaches can update own profile" ON public.coaches_public;
CREATE POLICY "coaches_public_coach_update_own"
ON public.coaches_public
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- STEP 3: Ensure coaches_private is admin + own-row only
-- Clean up any duplicate policies
DROP POLICY IF EXISTS "Admins can manage coaches_private" ON public.coaches_private;
DROP POLICY IF EXISTS "Admins can view all coaches_private" ON public.coaches_private;
DROP POLICY IF EXISTS "Admins can update all coaches_private" ON public.coaches_private;
DROP POLICY IF EXISTS "Coaches can view own private data" ON public.coaches_private;
DROP POLICY IF EXISTS "Coaches can update own private data" ON public.coaches_private;

-- Admin full access to coaches_private
CREATE POLICY "coaches_private_admin_all"
ON public.coaches_private
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Coaches can view their own private data only
CREATE POLICY "coaches_private_coach_select_own"
ON public.coaches_private
FOR SELECT
USING (auth.uid() = user_id);

-- Coaches can update their own private data only
CREATE POLICY "coaches_private_coach_update_own"
ON public.coaches_private
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- STEP 4: Add social URLs to coaches_public if not already there
-- These are non-sensitive and useful for public profiles
ALTER TABLE public.coaches_public
ADD COLUMN IF NOT EXISTS instagram_url text,
ADD COLUMN IF NOT EXISTS tiktok_url text,
ADD COLUMN IF NOT EXISTS youtube_url text;

-- STEP 5: Create trigger to sync public social URLs from coaches_private
CREATE OR REPLACE FUNCTION public.sync_coaches_public_socials()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    UPDATE coaches_public 
    SET 
      instagram_url = NEW.instagram_url,
      tiktok_url = NEW.tiktok_url,
      youtube_url = NEW.youtube_url
    WHERE id = NEW.coach_public_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_coaches_public_socials_trigger ON public.coaches_private;
CREATE TRIGGER sync_coaches_public_socials_trigger
AFTER INSERT OR UPDATE ON public.coaches_private
FOR EACH ROW
EXECUTE FUNCTION sync_coaches_public_socials();

-- Backfill existing social URLs
UPDATE coaches_public cp
SET 
  instagram_url = priv.instagram_url,
  tiktok_url = priv.tiktok_url,
  youtube_url = priv.youtube_url
FROM coaches_private priv
WHERE cp.id = priv.coach_public_id;

-- STEP 6: Document the security model
COMMENT ON TABLE public.coaches IS 
'Legacy coaches table. Access restricted to admins only.
For coach profile data, use coaches_public (public fields) or coaches_private (PII).';

COMMENT ON TABLE public.coaches_public IS 
'Public coach profile data. Accessible by all authenticated users.
Contains: name, bio, specialties, profile picture, social URLs.
Does NOT contain: email, phone, WhatsApp, DOB.';

COMMENT ON TABLE public.coaches_private IS 
'Private coach contact information (PII). Access restricted to:
- Admins: full access
- Coaches: own row only
Contains: email, phone, WhatsApp, DOB, gender.';
