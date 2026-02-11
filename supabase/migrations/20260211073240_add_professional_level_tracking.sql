-- Migration 2: Professional Level Tracking

-- ============================================================
-- 1. ADD COLUMNS TO coaches_public
-- ============================================================

ALTER TABLE coaches_public
  ADD COLUMN coach_level professional_level NOT NULL DEFAULT 'junior',
  ADD COLUMN is_head_coach BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN head_coach_specialisation TEXT;

-- ============================================================
-- 2. DROP AND RECREATE DEPENDENT VIEWS
-- Views must be dropped because CREATE OR REPLACE cannot reorder columns.
-- ============================================================

DROP VIEW IF EXISTS coaches_full;
DROP VIEW IF EXISTS coaches_directory_admin;
DROP VIEW IF EXISTS coaches_directory;

CREATE VIEW coaches_full AS
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
  cp.instagram_url,
  cp.tiktok_url,
  cp.youtube_url,
  cp.coach_level,
  cp.is_head_coach,
  cp.head_coach_specialisation,
  cpriv.email,
  cpriv.phone,
  cpriv.whatsapp_number,
  cpriv.date_of_birth,
  cpriv.gender,
  cpriv.snapchat_url
FROM coaches_public cp
LEFT JOIN coaches_private cpriv ON cp.id = cpriv.coach_public_id;

CREATE VIEW coaches_directory_admin AS
SELECT
  cp.id,
  cp.user_id,
  cp.first_name,
  cp.last_name,
  cp.display_name,
  cp.nickname,
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
  cp.instagram_url,
  cp.tiktok_url,
  cp.youtube_url,
  cp.created_at,
  cp.updated_at,
  cp.coach_level,
  cp.is_head_coach,
  cp.head_coach_specialisation,
  cpriv.email,
  cpriv.phone,
  cpriv.whatsapp_number,
  cpriv.date_of_birth,
  cpriv.gender,
  cpriv.snapchat_url
FROM coaches_public cp
LEFT JOIN coaches_private cpriv ON cp.id = cpriv.coach_public_id
WHERE cp.status = 'active';

CREATE VIEW coaches_directory AS
SELECT
  user_id,
  first_name,
  last_name,
  nickname,
  display_name,
  short_bio,
  bio,
  profile_picture_url,
  qualifications,
  specializations,
  specialties,
  location,
  status,
  coach_level,
  is_head_coach,
  head_coach_specialisation
FROM coaches_public
WHERE status = 'active';

-- Fix security invoker on recreated views
ALTER VIEW coaches_full SET (security_invoker = on);
ALTER VIEW coaches_directory_admin SET (security_invoker = on);
ALTER VIEW coaches_directory SET (security_invoker = on);

-- ============================================================
-- 3. STAFF PROFESSIONAL INFO (non-coach professionals)
-- ============================================================

CREATE TABLE staff_professional_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role professional_role NOT NULL,
  level professional_level NOT NULL DEFAULT 'junior',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. RLS
-- ============================================================

ALTER TABLE staff_professional_info ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_full_staff_professional_info" ON staff_professional_info
  FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "user_read_own_staff_professional_info" ON staff_professional_info
  FOR SELECT USING (auth.uid() = user_id);
