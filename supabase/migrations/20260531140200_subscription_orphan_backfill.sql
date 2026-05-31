-- B7-N2 one-shot backfill: sync subscriptions.coach_id to the destination
-- team's head coach for any row whose team_id is set but whose coach_id
-- doesn't match the team's coach_id. Covers the live prod orphan
-- 352de8b3-2980-403c-a619-f47962a1f9f9 (team_id set, coach_id NULL,
-- needs_coach_assignment=false) plus any legacy migration-backfill rows.
--
-- This runs as the migration (postgres) connection, where auth.uid() IS NULL,
-- so enforce_subscription_column_whitelist (migration 20260531140100) takes
-- its first bypass branch and allows the write -- verified in a BEGIN/ROLLBACK
-- dry-run before this migration was committed.
UPDATE public.subscriptions s
   SET coach_id = ct.coach_id
  FROM public.coach_teams ct
 WHERE s.team_id = ct.id
   AND s.coach_id IS DISTINCT FROM ct.coach_id;
