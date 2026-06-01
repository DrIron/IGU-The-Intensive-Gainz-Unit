-- B7-N19: idempotency key for program assignment.
-- assign_program_to_client previously had no uniqueness guard, so a repeated
-- assignment (e.g. a head coach re-running team fan-out) created duplicate
-- client_programs rows. Add a UNIQUE on the natural key so re-runs raise
-- unique_violation, which assign_team_program_atomic catches as
-- 'skipped_existing'. Verified live 2026-06-01: 0 duplicate tuples, 0
-- null-subscription rows -> safe to add.
--
-- Side effect (intended): the 1:1 path (assign_program_to_client via
-- AssignProgramDialog) now also rejects an identical re-assignment
-- (same subscription + template + start_date) instead of silently duplicating.
ALTER TABLE public.client_programs
  ADD CONSTRAINT client_programs_sub_template_start_uniq
  UNIQUE (subscription_id, source_template_id, start_date);
