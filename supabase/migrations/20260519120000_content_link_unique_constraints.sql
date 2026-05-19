-- PR L-fix: Convert partial unique indexes on the content-link tables to
-- regular UNIQUE constraints so PostgREST ON CONFLICT works.
--
-- PR K's partial indexes (... WHERE video_id IS NOT NULL) cannot be matched
-- by INSERT ... ON CONFLICT (col1, col2) DO ... unless the same WHERE clause
-- is supplied -- PostgREST's on_conflict query parameter doesn't support
-- predicates, so the upsert path in LinkContentDialog failed with
-- "42P10: there is no unique or exclusion constraint matching the ON CONFLICT
-- specification".
--
-- Multi-NULL behavior is preserved: in PostgreSQL, NULL values are distinct
-- in unique constraints by default, so many rows with video_id=NULL (the
-- playlist rows) and many with playlist_id=NULL (the video rows) coexist
-- under each named constraint without conflict. The original CHECK
-- ((video_id IS NULL) <> (playlist_id IS NULL)) still guarantees exactly
-- one of the two is set per row.

BEGIN;

-- ========== program_template_content_links ==========
DROP INDEX IF EXISTS public.uq_ptcl_video;
DROP INDEX IF EXISTS public.uq_ptcl_playlist;

ALTER TABLE public.program_template_content_links
  ADD CONSTRAINT uq_ptcl_video    UNIQUE (program_template_id, video_id),
  ADD CONSTRAINT uq_ptcl_playlist UNIQUE (program_template_id, playlist_id);

-- ========== nutrition_phase_content_links ==========
DROP INDEX IF EXISTS public.uq_npcl_video;
DROP INDEX IF EXISTS public.uq_npcl_playlist;

ALTER TABLE public.nutrition_phase_content_links
  ADD CONSTRAINT uq_npcl_video    UNIQUE (nutrition_phase_id, video_id),
  ADD CONSTRAINT uq_npcl_playlist UNIQUE (nutrition_phase_id, playlist_id);

COMMIT;
