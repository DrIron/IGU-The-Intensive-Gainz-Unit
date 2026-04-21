-- ============================================================
-- exercise_set_logs UPDATE policy: add missing WITH CHECK
--
-- The original policy (migration 20260126102728) declared only `USING`,
-- which lets the row pass the pre-update ownership test but leaves the
-- post-update check empty. Supabase upsert hitting the UPDATE branch
-- (ON CONFLICT) was silently rejected for some clients — session runner
-- upsert call showed no error client-side (see CLAUDE.md silent-200-RLS
-- pattern) but the row never persisted.
--
-- Adding WITH CHECK = USING ensures post-update ownership is verified
-- and upsert updates land cleanly. Insert policy already has its own
-- WITH CHECK and stays untouched.
-- ============================================================

DROP POLICY IF EXISTS "Clients can update own set logs" ON public.exercise_set_logs;

CREATE POLICY "Clients can update own set logs"
  ON public.exercise_set_logs FOR UPDATE
  TO authenticated
  USING (created_by_user_id = auth.uid())
  WITH CHECK (created_by_user_id = auth.uid());
