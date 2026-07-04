-- Teams management — public team-covers storage bucket + folder-scoped RLS (Hasan, 2026-07-04).
-- coach_teams.cover_image_url already exists and TeamBrowserCard renders it; this adds the upload
-- path. Objects live under team-covers/<teamId>/… — a head coach may write only under folders for
-- teams they own (coach_teams.coach_id = auth.uid()). Public read (covers show on the team browser).
-- Mirrors the coach-profiles bucket scoping.
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-covers', 'team-covers', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view team covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'team-covers');

CREATE POLICY "Head coach can upload team cover"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'team-covers'
  AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.coach_teams WHERE coach_id = auth.uid())
);

CREATE POLICY "Head coach can update team cover"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'team-covers'
  AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.coach_teams WHERE coach_id = auth.uid())
);

CREATE POLICY "Head coach can delete team cover"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'team-covers'
  AND (storage.foldername(name))[1] IN (SELECT id::text FROM public.coach_teams WHERE coach_id = auth.uid())
);
