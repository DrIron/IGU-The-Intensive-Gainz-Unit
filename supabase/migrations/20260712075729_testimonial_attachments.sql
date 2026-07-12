-- T3.1 Migration A — testimonial proof attachment columns (spec §1).
-- attachment_type: 'none' (default) | 'weight_change' | 'lift_progression' (T4, reserved).
-- attachment: denormalized snapshot jsonb so public renders never read private weight_logs.
-- For weight_change: { phase_id, phase_name, goal_type, start_kg, end_kg, delta_kg, weeks, from_date, to_date }.

ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS attachment_type text NOT NULL DEFAULT 'none'
    CHECK (attachment_type IN ('none','weight_change','lift_progression')),
  ADD COLUMN IF NOT EXISTS attachment jsonb,
  ADD COLUMN IF NOT EXISTS attachment_note text
    CHECK (attachment_note IS NULL OR char_length(attachment_note) <= 280);
