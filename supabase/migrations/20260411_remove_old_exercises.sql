-- Remove the original ~107 exercises seeded in 20260208130000
-- These have old naming format (no taxonomy) and are duplicated by the V2 library
-- Identify them: global, no coach, no subdivision, no movement_pattern, 
-- and name doesn't have resistance profile suffix (L)/(M)/(S)

DELETE FROM exercise_library
WHERE is_global = true
  AND created_by_coach_id IS NULL
  AND subdivision IS NULL
  AND movement_pattern IS NULL
  AND name NOT LIKE '%(L)'
  AND name NOT LIKE '%(M)'
  AND name NOT LIKE '%(S)';
