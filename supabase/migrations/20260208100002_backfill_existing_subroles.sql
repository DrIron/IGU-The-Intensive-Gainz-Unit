-- ============================================================
-- Phase 26: Backfill Existing Users into Subroles
-- Migrates existing dietitians and coaches from user_roles
-- ============================================================

-- Backfill existing dietitians: user_roles.role = 'dietitian' → user_subroles (approved)
INSERT INTO public.user_subroles (user_id, subrole_id, status, credential_notes, reviewed_at)
SELECT
  ur.user_id,
  sd.id,
  'approved'::subrole_status,
  'Backfilled from existing dietitian role',
  now()
FROM public.user_roles ur
CROSS JOIN public.subrole_definitions sd
WHERE ur.role = 'dietitian'::app_role
  AND sd.slug = 'dietitian'
ON CONFLICT (user_id, subrole_id) DO NOTHING;

-- Backfill existing coaches: user_roles.role = 'coach' → user_subroles (approved, slug='coach')
INSERT INTO public.user_subroles (user_id, subrole_id, status, credential_notes, reviewed_at)
SELECT
  ur.user_id,
  sd.id,
  'approved'::subrole_status,
  'Backfilled from existing coach role',
  now()
FROM public.user_roles ur
CROSS JOIN public.subrole_definitions sd
WHERE ur.role = 'coach'::app_role
  AND sd.slug = 'coach'
ON CONFLICT (user_id, subrole_id) DO NOTHING;
