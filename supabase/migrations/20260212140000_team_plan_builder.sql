-- ============================================================================
-- Phase 32: Team Plan Builder (Redesigned)
-- ============================================================================
-- Teams are service-agnostic — all share one "Team Plan" service at 12 KWD
-- Clients pick a specific team during onboarding
-- Membership tracked via subscriptions.team_id (not derived from coach+service)
-- ============================================================================

-- 1. Create coach_teams table (no service_id)
CREATE TABLE public.coach_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  current_program_template_id UUID REFERENCES public.program_templates(id),
  max_members INT DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add team_id to client_programs
ALTER TABLE public.client_programs ADD COLUMN team_id UUID REFERENCES public.coach_teams(id);
CREATE INDEX idx_client_programs_team_id ON public.client_programs(team_id);

-- 3. Add team_id to subscriptions (direct team membership tracking)
ALTER TABLE public.subscriptions ADD COLUMN team_id UUID REFERENCES public.coach_teams(id);
CREATE INDEX idx_subscriptions_team_id ON public.subscriptions(team_id);

-- 4. RLS on coach_teams
ALTER TABLE public.coach_teams ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active teams (clients need this for onboarding)
CREATE POLICY coach_teams_read_active ON public.coach_teams FOR SELECT
  USING (is_active = true);

-- Head coach INSERT
CREATE POLICY coach_teams_coach_insert ON public.coach_teams FOR INSERT
  WITH CHECK (
    auth.uid() = coach_id
    AND EXISTS (
      SELECT 1 FROM public.coaches_public
      WHERE user_id = auth.uid() AND is_head_coach = true
    )
  );

-- Coach UPDATE own
CREATE POLICY coach_teams_coach_update ON public.coach_teams FOR UPDATE
  USING (auth.uid() = coach_id)
  WITH CHECK (auth.uid() = coach_id);

-- Coach DELETE own
CREATE POLICY coach_teams_coach_delete ON public.coach_teams FOR DELETE
  USING (auth.uid() = coach_id);

-- Admin full access
CREATE POLICY coach_teams_admin_all ON public.coach_teams FOR ALL
  USING (public.is_admin(auth.uid()));

-- 5. updated_at trigger
CREATE TRIGGER set_coach_teams_updated_at
  BEFORE UPDATE ON public.coach_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Index for team member queries via subscriptions.team_id
CREATE INDEX idx_subscriptions_team_active ON public.subscriptions(team_id)
  WHERE status IN ('pending', 'active');

-- 7. Consolidate team services into one generic "Team Plan"
INSERT INTO public.services (name, description, price_kwd, type, slug, is_active)
VALUES ('Team Plan', 'Group coaching under a head coach — hypertrophy, strength, and more.', 12, 'team', 'team_plan', true)
ON CONFLICT DO NOTHING;

-- Deactivate old team-specific services
UPDATE public.services SET is_active = false WHERE slug IN ('team_fe_squad', 'team_bunz');

-- 8. Add team_plan to form_type enum
ALTER TYPE public.form_type ADD VALUE IF NOT EXISTS 'team_plan';

-- 9. Add selected_team_id to form_submissions for audit
ALTER TABLE public.form_submissions ADD COLUMN IF NOT EXISTS selected_team_id UUID REFERENCES public.coach_teams(id);
