-- Phase 1A migration 2/6 — Coach column-ownership refactor
-- Seeds `coaches_public` rows for any `coaches.user_id` that doesn't
-- have one yet. This closes the seed bug from § 6 of the plan for
-- already-affected coaches; Phase 1B's `upsert_coach_full(...)` routing
-- prevents new coaches from hitting the bug.
--
-- Idempotent: ON CONFLICT (user_id) DO NOTHING. Safe to re-run.
--
-- Source: every NOT NULL column on coaches_public gets a sensible default
-- when missing on coaches. coaches_public.first_name and last_name are
-- NOT NULL on both sides, so we can pass through directly.
-- last_assigned_at and capacity columns may be NULL — that's fine, they
-- have no NOT NULL constraint on coaches_public.

INSERT INTO public.coaches_public (
  user_id,
  first_name,
  last_name,
  nickname,
  bio,
  short_bio,
  location,
  profile_picture_url,
  qualifications,
  specializations,
  specialties,
  status,
  max_onetoone_clients,
  max_team_clients,
  last_assigned_at,
  created_at,
  updated_at
)
SELECT
  c.user_id,
  c.first_name,
  COALESCE(c.last_name, ''),
  c.nickname,
  c.bio,
  c.short_bio,
  c.location,
  c.profile_picture_url,
  COALESCE(c.qualifications, '{}'::text[]),
  COALESCE(c.specializations, '{}'::text[]),
  COALESCE(c.specialties, '{}'::staff_specialty[]),
  COALESCE(c.status, 'pending'),
  c.max_onetoone_clients,
  c.max_team_clients,
  c.last_assigned_at,
  c.created_at,
  c.updated_at
FROM public.coaches c
LEFT JOIN public.coaches_public cp ON cp.user_id = c.user_id
WHERE cp.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Verification query (informational, executed at apply time):
DO $$
DECLARE
  v_orphans INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_orphans
  FROM public.coaches c
  LEFT JOIN public.coaches_public cp ON cp.user_id = c.user_id
  WHERE cp.user_id IS NULL;

  IF v_orphans > 0 THEN
    RAISE WARNING 'After seed: % coaches still without a coaches_public row', v_orphans;
  ELSE
    RAISE NOTICE 'After seed: every coach has a coaches_public row';
  END IF;
END $$;
