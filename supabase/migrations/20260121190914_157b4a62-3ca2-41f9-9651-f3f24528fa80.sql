-- =============================================================================
-- COACHES PRIVACY SPLIT - Safe migration approach
-- =============================================================================

-- Step 1: Drop the coaches_public VIEW (it's just a VIEW, we'll create a TABLE)
DROP VIEW IF EXISTS public.coaches_public;

-- Step 2: Create coaches_public TABLE with only safe public fields
CREATE TABLE public.coaches_public (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT DEFAULT '',
  nickname TEXT,
  display_name TEXT,
  bio TEXT,
  short_bio TEXT,
  location TEXT,
  profile_picture_url TEXT,
  qualifications TEXT[],
  specializations TEXT[],
  specialties staff_specialty[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  max_onetoone_clients INTEGER,
  max_team_clients INTEGER,
  last_assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 3: Migrate data from coaches table to coaches_public
INSERT INTO public.coaches_public (
  id, user_id, first_name, last_name, nickname, 
  display_name,
  bio, short_bio, location,
  profile_picture_url, qualifications, specializations, specialties,
  status, max_onetoone_clients, max_team_clients, last_assigned_at,
  created_at, updated_at
)
SELECT 
  id, user_id, first_name, COALESCE(last_name, ''), nickname, 
  COALESCE(nickname, first_name || ' ' || COALESCE(last_name, '')),
  bio, short_bio, location,
  profile_picture_url, qualifications, specializations, specialties,
  status, max_onetoone_clients, max_team_clients, last_assigned_at,
  created_at, updated_at
FROM public.coaches;

-- Step 4: Rename coach_contacts to coaches_private
ALTER TABLE public.coach_contacts RENAME TO coaches_private;

-- Step 5: Add user_id column to coaches_private (if not exists)
ALTER TABLE public.coaches_private 
ADD COLUMN IF NOT EXISTS user_id UUID;

-- Step 6: Populate user_id in coaches_private from coaches table
UPDATE public.coaches_private cp
SET user_id = c.user_id
FROM public.coaches c
WHERE cp.coach_id = c.id;

-- Step 7: Rename coach_id to coach_public_id for clarity
ALTER TABLE public.coaches_private 
RENAME COLUMN coach_id TO coach_public_id;

-- Step 8: Add gender column if not exists
ALTER TABLE public.coaches_private 
ADD COLUMN IF NOT EXISTS gender TEXT;

-- Step 9: Enable RLS on coaches_public
ALTER TABLE public.coaches_public ENABLE ROW LEVEL SECURITY;

-- Step 10: Drop existing RLS policies on coaches_private (from old coach_contacts)
DROP POLICY IF EXISTS "Admins full access to coach_contacts" ON public.coaches_private;
DROP POLICY IF EXISTS "Coaches can update own contact info" ON public.coaches_private;
DROP POLICY IF EXISTS "Coaches can view own contact info" ON public.coaches_private;

-- =============================================================================
-- RLS POLICIES FOR coaches_public
-- =============================================================================

-- Clients and coaches can view active coaches (for coach directory)
CREATE POLICY "Authenticated users can view active coaches"
ON public.coaches_public FOR SELECT
TO authenticated
USING (status IN ('active', 'approved'));

-- Coaches can view own profile regardless of status
CREATE POLICY "Coaches can view own profile"
ON public.coaches_public FOR SELECT
USING (auth.uid() = user_id);

-- Coaches can update their own public profile
CREATE POLICY "Coaches can update own profile"
ON public.coaches_public FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins have full access
CREATE POLICY "Admins full access to coaches_public"
ON public.coaches_public FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- =============================================================================
-- RLS POLICIES FOR coaches_private (ADMIN + COACH SELF ONLY - NO CLIENTS)
-- =============================================================================

-- Admins can view all private coach data
CREATE POLICY "Admins can view all coaches_private"
ON public.coaches_private FOR SELECT
USING (has_role(auth.uid(), 'admin'));

-- Admins can update all private coach data
CREATE POLICY "Admins can update all coaches_private"
ON public.coaches_private FOR UPDATE
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Admins can insert/delete coach private data
CREATE POLICY "Admins can manage coaches_private"
ON public.coaches_private FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Coaches can view their own private data
CREATE POLICY "Coaches can view own private data"
ON public.coaches_private FOR SELECT
USING (auth.uid() = user_id);

-- Coaches can update their own private data
CREATE POLICY "Coaches can update own private data"
ON public.coaches_private FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- Step 11: Create a joined VIEW for admin use (coaches_full)
-- =============================================================================
CREATE OR REPLACE VIEW public.coaches_full AS
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
  -- Private fields
  cpriv.email,
  cpriv.phone,
  cpriv.whatsapp_number,
  cpriv.date_of_birth,
  cpriv.gender,
  cpriv.instagram_url,
  cpriv.tiktok_url,
  cpriv.snapchat_url,
  cpriv.youtube_url
FROM public.coaches_public cp
LEFT JOIN public.coaches_private cpriv ON cp.id = cpriv.coach_public_id;

-- Step 12: Create updated_at triggers
CREATE TRIGGER update_coaches_public_updated_at
BEFORE UPDATE ON public.coaches_public
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Step 13: Add indexes for performance
CREATE INDEX idx_coaches_public_user_id ON public.coaches_public(user_id);
CREATE INDEX idx_coaches_public_status ON public.coaches_public(status);
CREATE INDEX idx_coaches_private_user_id ON public.coaches_private(user_id);
CREATE INDEX idx_coaches_private_coach_public_id ON public.coaches_private(coach_public_id);