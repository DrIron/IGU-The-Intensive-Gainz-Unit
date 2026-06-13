-- Exercise Library Redesign — cleanup: link exercises to execution cues + fix one
-- missed oblique classification.
--
-- 1. Backfill exercise_library.movement_pattern_id (the FK was never populated) by
--    matching the legacy text taxonomy to movement_patterns
--    (muscle_group, subdivision, movement). This wires each exercise to its
--    execution_points cues. ~340/348 active rows match; the unmatched ones are
--    oblique rotation/lateral-flexion movements that movement_patterns has no cue
--    rows for yet (content gap for the IGU team).
--
-- 2. Reclassify "Abs BW 45 Degree Lateral Flexion (M)" to Obliques — it's a lateral
--    flexion (oblique) movement that the Phase 2 oblique sweep missed (its name lacks
--    "side bend"/"rotation"). Keeps the obliques set anatomically consistent.

UPDATE public.exercise_library el
SET movement_pattern_id = mp.id
FROM public.movement_patterns mp
WHERE mp.muscle_group = el.muscle_group
  AND mp.subdivision IS NOT DISTINCT FROM el.subdivision
  AND mp.movement = el.movement_pattern
  AND el.movement_pattern_id IS NULL;

UPDATE public.exercise_library
SET muscle_id = (SELECT id FROM public.muscles WHERE slug = 'obliques'),
    subdivision_id = NULL
WHERE name = 'Abs BW 45 Degree Lateral Flexion (M)';
