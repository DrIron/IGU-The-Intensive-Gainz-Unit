-- B9-N8 + B9-N9: testimonials integrity + anti-spam.
-- Verified live 2026-06-01: 0 rows, 0 over-length, 0 duplicate (user_id, coach_id)
-- pairs -> both constraints add cleanly. No functions added -> no GRANT changes.

-- B9-N8: bound feedback length (same pattern as coach_client_messages.message).
ALTER TABLE public.testimonials
  ADD CONSTRAINT testimonials_feedback_length
  CHECK (char_length(feedback) BETWEEN 1 AND 4000);

-- B9-N9: one testimonial per (user, coach). A user with multiple coaches can
-- submit one per coach; re-submission for the same coach is blocked (FE catches
-- 23505 and shows "already submitted"). NOTE: coach_id is nullable and Postgres
-- treats NULLs as distinct, so multiple coach-less (general) testimonials by the
-- same user are NOT blocked by this -- acceptable per the finding's default.
ALTER TABLE public.testimonials
  ADD CONSTRAINT testimonials_user_coach_unique
  UNIQUE (user_id, coach_id);
