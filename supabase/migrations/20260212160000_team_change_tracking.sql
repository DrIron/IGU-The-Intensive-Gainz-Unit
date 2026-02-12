-- Team change tracking: column + backfill old Fe Squad/Bunz subscriptions
-- Add last_team_change_at for once-per-cycle enforcement
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_team_change_at TIMESTAMPTZ;

-- Backfill: migrate old Fe Squad/Bunz subscriptions to Team Plan service
-- Leave team_id NULL — clients will be prompted to choose their team
UPDATE public.subscriptions
SET service_id = (SELECT id FROM public.services WHERE slug = 'team_plan' LIMIT 1)
WHERE service_id IN (
  SELECT id FROM public.services WHERE slug IN ('team_fe_squad', 'team_bunz')
)
AND status IN ('active', 'pending', 'past_due');
