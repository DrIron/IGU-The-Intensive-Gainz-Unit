-- Specialist parity — S2: generalize coach_applications for any professional subrole.
-- `subrole_slug` marks WHICH track an application is for (coach | dietitian | physiotherapist |
-- sports_psychologist | mobility_coach). Every existing row is a coach application → default 'coach'.
-- This is distinct from `requested_subroles[]` (extra practitioner credentials a *coach* applicant
-- asks for during the coach flow). No RLS change: the existing anon INSERT policy already gates on
-- status='pending', and the FK below (validated system-side, not via caller RLS) constrains the value.

ALTER TABLE public.coach_applications
  ADD COLUMN IF NOT EXISTS subrole_slug text NOT NULL DEFAULT 'coach';

COMMENT ON COLUMN public.coach_applications.subrole_slug IS
  'Application track = which professional subrole this application targets (subrole_definitions.slug). ''coach'' = base coach hiring pipeline; specialists (dietitian, physiotherapist, ...) reuse this same table + apply flow.';

-- Validate against the canonical subrole vocabulary (subrole_definitions.slug is UNIQUE).
ALTER TABLE public.coach_applications
  DROP CONSTRAINT IF EXISTS coach_applications_subrole_slug_fkey;
ALTER TABLE public.coach_applications
  ADD CONSTRAINT coach_applications_subrole_slug_fkey
  FOREIGN KEY (subrole_slug) REFERENCES public.subrole_definitions(slug);

-- Queue reads filter by (track, status).
CREATE INDEX IF NOT EXISTS idx_coach_applications_subrole_status
  ON public.coach_applications(subrole_slug, status);
