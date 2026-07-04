-- P1 access-boundary hardening — team_waitlist: validate the open INSERT (Hasan, 2026-07-04).
--
-- "Anyone can join team waitlist" is WITH CHECK (true) — anon can insert any team_id/email with
-- no validation (spam/garbage surface; contrast `leads`, which validates). Keep anon capture,
-- add: valid email (regex + length, mirroring the leads policy) AND team_id must be a real,
-- joinable team. The `team_id IN (…)` subquery is safe under RLS — coach_teams has a public
-- "Anyone can read public active teams" SELECT policy, so anon can evaluate it.
DROP POLICY "Anyone can join team waitlist" ON public.team_waitlist;

CREATE POLICY "team_waitlist_insert_validated" ON public.team_waitlist
FOR INSERT TO anon, authenticated
WITH CHECK (
  email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND length(email) >= 3
  AND length(email) <= 254
  AND team_id IN (SELECT ct.id FROM public.coach_teams ct WHERE ct.is_active AND ct.is_public)
);
