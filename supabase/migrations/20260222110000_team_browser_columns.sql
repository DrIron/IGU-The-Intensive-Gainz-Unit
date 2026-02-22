-- ============================================
-- Phase 3: Team Browser — New Columns + Waitlist
-- ============================================
-- Extends coach_teams with public browsing metadata.
-- Creates team_waitlist for capacity overflow signups.
-- NOTE: description and max_members already exist on coach_teams (migration 20260212140000).

-- New columns on coach_teams
ALTER TABLE public.coach_teams ADD COLUMN IF NOT EXISTS cover_image_url TEXT;
ALTER TABLE public.coach_teams ADD COLUMN IF NOT EXISTS training_goal TEXT;
ALTER TABLE public.coach_teams ADD COLUMN IF NOT EXISTS sessions_per_week INTEGER;
ALTER TABLE public.coach_teams ADD COLUMN IF NOT EXISTS session_duration_min INTEGER;
ALTER TABLE public.coach_teams ADD COLUMN IF NOT EXISTS cycle_start_date DATE;
ALTER TABLE public.coach_teams ADD COLUMN IF NOT EXISTS cycle_weeks INTEGER DEFAULT 8;
ALTER TABLE public.coach_teams ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;
ALTER TABLE public.coach_teams ADD COLUMN IF NOT EXISTS waitlist_enabled BOOLEAN DEFAULT true;

-- Team waitlist table
CREATE TABLE IF NOT EXISTS public.team_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.coach_teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles_public(id),
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'invited', 'joined', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  CONSTRAINT team_waitlist_team_email_key UNIQUE (team_id, email)
);

-- Indexes
CREATE INDEX idx_team_waitlist_team_status ON public.team_waitlist(team_id, status);
CREATE INDEX idx_coach_teams_is_public ON public.coach_teams(is_public)
  WHERE is_active = true;

-- RLS
ALTER TABLE public.team_waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (email capture for waitlist)
CREATE POLICY "Anyone can join team waitlist"
  ON public.team_waitlist
  FOR INSERT
  WITH CHECK (true);

-- Users can read their own waitlist entries
CREATE POLICY "Users can read own waitlist entries"
  ON public.team_waitlist
  FOR SELECT
  USING (auth.uid() = user_id OR email IN (
    SELECT priv.email FROM profiles_private priv WHERE priv.profile_id = auth.uid()
  ));

-- Admins can manage all waitlist entries
CREATE POLICY "Admins can manage team waitlist"
  ON public.team_waitlist
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- Coaches can read waitlist for their own teams
CREATE POLICY "Coaches can read own team waitlist"
  ON public.team_waitlist
  FOR SELECT
  USING (
    team_id IN (
      SELECT id FROM public.coach_teams WHERE coach_id = auth.uid()
    )
  );

-- Allow anonymous read of public teams (for /teams page)
CREATE POLICY "Anyone can read public active teams"
  ON public.coach_teams
  FOR SELECT
  USING (is_active = true AND is_public = true);

-- Seed site_content for teams page header
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order)
VALUES
  ('teams', 'hero', 'title', 'TEAM PLANS', 'text', 1),
  ('teams', 'hero', 'subtitle', 'Join a structured group training program led by our expert coaches. 12 KWD/month.', 'text', 2),
  ('teams', 'hero', 'description', 'Each team follows a periodized program designed by the head coach. Get access to community support, weekly programming updates, and exercise library access.', 'text', 3)
ON CONFLICT (page, section, key) DO NOTHING;
