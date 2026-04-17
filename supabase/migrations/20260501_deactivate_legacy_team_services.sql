-- Deactivate legacy team services (team_fe_squad, team_bunz).
-- Post-phase-32b, all teams share one "Team Plan" service (12 KWD).
-- Team names (Fe Squad, Bunz of Steel) live in coach_teams.name, not as separate services.
--
-- Found during 2026-04-17 audit:
--   - /admin/pricing-payouts still shows them as Active
--   - /admin/coaches Capacity Management includes them in per-coach capacity rows
--   - /admin/discord-legal includes them in Service Configuration
-- Root cause: phase 32b didn't flip is_active on the old services rows.

UPDATE public.services
SET is_active = false,
    updated_at = now()
WHERE slug IN ('team_fe_squad', 'team_bunz')
  AND is_active = true;

-- Sanity: exactly 2 rows should have been updated.
-- Confirm remaining active team-type services are just 'team_plan':
--   SELECT slug, name, is_active FROM services WHERE type = 'team' AND is_active = true;
