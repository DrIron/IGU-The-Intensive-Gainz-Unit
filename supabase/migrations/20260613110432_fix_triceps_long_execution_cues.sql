-- Fix Triceps Long Head execution cues that the 2026-05-12 refinement missed.
--
-- Migration 20260512100932_execution_cue_refinements.sql Section 6 filtered on
--   muscle_group = 'elbow_extensors' / subdivision = 'elbow_extensors_triceps_long'
-- but the real movement_patterns rows are muscle_group = 'triceps' /
-- subdivision = 'triceps_long'. The remote run updated ZERO rows; the two
-- Triceps Long Head movements still hold their pre-refinement cues.
--
-- This re-runs Section 6 with the correct filter. Cue text is identical to the
-- intended (but unapplied) content. Supersedes
-- _pending_migrations/20260512000000_execution_cue_refinements.sql (delete that
-- file after this is applied).

UPDATE public.movement_patterns
SET execution_points = ARRAY[
  'Slightly tense the back to hold the shoulder in place',
  'Extend the forearm away from the humerus — fully extending the elbow joint',
  'Movement comes solely from the elbow',
  'Control the eccentric — allow the elbow to flex under control'
],
    updated_at = now()
WHERE muscle_group = 'triceps'
  AND subdivision  = 'triceps_long'
  AND movement IN (
    'Overhead Extension (scapular plane)',
    'Extension with Shoulder Extension (scapular aligned)'
  );

-- Sanity check: expect 2 rows updated. The remaining empty-cue rows
-- (cardio x2, warmup x2, mobility x2, lats 'Pulldown (wide/overhand)') are left
-- untouched on purpose — they need coaching cue content from the IGU team, not
-- fabricated text. Track them in docs/EXERCISE_LIBRARY_REDESIGN.md.
