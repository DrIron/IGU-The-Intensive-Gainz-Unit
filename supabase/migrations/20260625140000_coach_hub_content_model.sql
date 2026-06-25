-- Coach Hub: generalize coach_educational_content into a typed coach-only
-- content model powering Training (required onboarding videos) + Library
-- (advanced coach-only videos) + Resources (ebooks / courses / links).
--
-- ALSO closes a leak: the old SELECT policy allowed ANY authenticated user
-- (clients included) to read this table. Coach-only content must never be
-- client-visible, so SELECT is restricted to coach/admin.
--
-- Additive + idempotent.

-- Non-video content (ebooks/courses/links) uses external_url, not video_url.
ALTER TABLE public.coach_educational_content ALTER COLUMN video_url DROP NOT NULL;

ALTER TABLE public.coach_educational_content
  ADD COLUMN IF NOT EXISTS content_type TEXT NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT 'training',
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS level TEXT,
  ADD COLUMN IF NOT EXISTS external_url TEXT,
  ADD COLUMN IF NOT EXISTS cover_url TEXT,
  ADD COLUMN IF NOT EXISTS author TEXT;

ALTER TABLE public.coach_educational_content DROP CONSTRAINT IF EXISTS coach_educational_content_content_type_check;
ALTER TABLE public.coach_educational_content ADD CONSTRAINT coach_educational_content_content_type_check
  CHECK (content_type IN ('video', 'ebook', 'course', 'link'));

ALTER TABLE public.coach_educational_content DROP CONSTRAINT IF EXISTS coach_educational_content_section_check;
ALTER TABLE public.coach_educational_content ADD CONSTRAINT coach_educational_content_section_check
  CHECK (section IN ('training', 'library', 'resources'));

ALTER TABLE public.coach_educational_content DROP CONSTRAINT IF EXISTS coach_educational_content_level_check;
ALTER TABLE public.coach_educational_content ADD CONSTRAINT coach_educational_content_level_check
  CHECK (level IS NULL OR level IN ('intro', 'advanced'));

-- Leak fix: was "Authenticated users can read active educational content"
-- (USING is_active = true) -> readable by clients. Restrict to staff.
DROP POLICY IF EXISTS "Authenticated users can read active educational content" ON public.coach_educational_content;
DROP POLICY IF EXISTS "Coaches and admins can read active coach content" ON public.coach_educational_content;
CREATE POLICY "Coaches and admins can read active coach content"
  ON public.coach_educational_content FOR SELECT
  USING (is_active = true AND (public.is_coach(auth.uid()) OR public.is_admin(auth.uid())));
