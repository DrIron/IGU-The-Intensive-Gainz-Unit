-- Coach Profile Redesign (CPR0) — new self-service profile fields.
-- Home is coaches_public (client-facing profile store, canonical per the
-- coach-tables column-ownership refactor). NOT coaches (Phase-3 drop list).
-- No RLS change: existing coaches_public own-row UPDATE + anon SELECT policies
-- are row-predicate (SELECT *-style), so the new columns are covered automatically.

ALTER TABLE public.coaches_public
  ADD COLUMN IF NOT EXISTS intro_video_url text,
  ADD COLUMN IF NOT EXISTS years_experience integer
    CHECK (years_experience IS NULL OR years_experience BETWEEN 0 AND 70);

COMMENT ON COLUMN public.coaches_public.intro_video_url IS 'Coach 30-sec intro video (YouTube/Vimeo/mp4). Self-service editable. Shown in public About.';
COMMENT ON COLUMN public.coaches_public.years_experience IS 'Coaching years; self-declared; drives the public stats row.';
