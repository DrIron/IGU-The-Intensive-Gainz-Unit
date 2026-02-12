-- ============================================================================
-- Phase 32: Team Plan Builder
-- ============================================================================
-- New table: coach_teams
-- Alter: client_programs + team_id
-- RLS policies on coach_teams
-- Index for team member queries
-- ============================================================================

-- 1. Create coach_teams table
CREATE TABLE public.coach_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  service_id UUID NOT NULL REFERENCES public.services(id),
  current_program_template_id UUID REFERENCES public.program_templates(id),
  max_members INT DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add team_id to client_programs
ALTER TABLE public.client_programs ADD COLUMN team_id UUID REFERENCES public.coach_teams(id);
CREATE INDEX idx_client_programs_team_id ON public.client_programs(team_id);

-- 3. RLS on coach_teams
ALTER TABLE public.coach_teams ENABLE ROW LEVEL SECURITY;

-- Coach can SELECT their own teams
CREATE POLICY coach_teams_coach_select ON public.coach_teams FOR SELECT
  USING (auth.uid() = coach_id);

-- Coach can INSERT only if they are a head coach
CREATE POLICY coach_teams_coach_insert ON public.coach_teams FOR INSERT
  WITH CHECK (
    auth.uid() = coach_id
    AND EXISTS (
      SELECT 1 FROM public.coaches_public
      WHERE user_id = auth.uid() AND is_head_coach = true
    )
  );

-- Coach can UPDATE their own teams
CREATE POLICY coach_teams_coach_update ON public.coach_teams FOR UPDATE
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- Coach can DELETE their own teams
CREATE POLICY coach_teams_coach_delete ON public.coach_teams FOR DELETE
  USING (auth.uid() = coach_id);

-- Admin full access
CREATE POLICY coach_teams_admin_all ON public.coach_teams FOR ALL
  USING (public.is_admin(auth.uid()));

-- 4. Index for team member queries (subscriptions by coach + service)
CREATE INDEX idx_subscriptions_coach_service_active
  ON public.subscriptions(coach_id, service_id)
  WHERE status IN ('pending', 'active');

-- 5. updated_at trigger
CREATE TRIGGER set_coach_teams_updated_at
  BEFORE UPDATE ON public.coach_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();
