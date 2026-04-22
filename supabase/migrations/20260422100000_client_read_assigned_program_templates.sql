-- ============================================================
-- Let clients read title/description of program_templates they've
-- been assigned via client_programs.
--
-- Context: yesterday's audit fix swapped TodaysWorkoutHero's dead
-- `programs` table query to `program_templates`. The dead-table 404
-- was resolved but the query now returns [] under RLS because
-- existing program_templates policies only allow the owning coach
-- (and admin). Clients need read-only access to their assigned
-- template's name/description so the dashboard's "Today's Workout"
-- card shows the real program title instead of the "Your Program"
-- fallback.
--
-- Scope is limited to templates referenced by the client's own
-- client_programs rows; no sideways access to other coaches' or
-- unassigned programs.
-- ============================================================

CREATE POLICY "Clients can read their assigned program_templates"
  ON public.program_templates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_programs cp
      WHERE cp.source_template_id = program_templates.id
        AND cp.user_id = auth.uid()
    )
  );
