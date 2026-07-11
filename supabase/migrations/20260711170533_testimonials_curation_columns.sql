-- T1 Migration A — testimonials curation + consent columns (spec §1).
-- Table is empty (0 rows) — no backfill needed. is_approved kept for back-compat
-- but no longer gates visibility (that moves to the §2 RLS rule).

ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS show_on_coach_page boolean NOT NULL DEFAULT false,   -- coach-writable (own rows)
  ADD COLUMN IF NOT EXISTS featured_public     boolean NOT NULL DEFAULT false,   -- admin-writable
  ADD COLUMN IF NOT EXISTS featured_rank       integer,                          -- admin ordering
  ADD COLUMN IF NOT EXISTS hidden_by_admin     boolean NOT NULL DEFAULT false,   -- admin moderation floor
  ADD COLUMN IF NOT EXISTS display_consent     boolean NOT NULL DEFAULT false,   -- client opt-in; required for ANY public visibility
  ADD COLUMN IF NOT EXISTS attribution         text NOT NULL DEFAULT 'first_initial'
    CHECK (attribution IN ('full_name','first_initial','anonymous')),
  ADD COLUMN IF NOT EXISTS withdrawn_at        timestamptz;                      -- client retracted → hidden everywhere

CREATE INDEX IF NOT EXISTS idx_testimonials_coach_visible
  ON public.testimonials (coach_id) WHERE show_on_coach_page AND NOT hidden_by_admin;
CREATE INDEX IF NOT EXISTS idx_testimonials_featured
  ON public.testimonials (featured_rank) WHERE featured_public AND NOT hidden_by_admin;
