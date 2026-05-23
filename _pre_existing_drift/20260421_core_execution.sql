-- Core Abs: Spinal Flexion
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull the ribcage down toward the pelvis',
  'At the same time flex the spine down toward the pelvis',
  'Control the eccentric — allow the spine to extend back under control',
  'Focus on spinal flexion — not hip flexion'
] WHERE muscle_group = 'core' AND movement = 'Spinal Flexion';

-- Core Abs: Anti-Extension
UPDATE movement_patterns SET execution_points = ARRAY[
  'Tense the abdominal musculature creating tension — pulling the ribcage and pelvis together',
  'Maintain a neutral or very slightly flexed spinal position — resisting extension',
  'Breathe against the brace',
  'Focus on holding position — do not allow the lower back to arch'
] WHERE muscle_group = 'core' AND movement = 'Anti-Extension';

-- Core Abs: Rotation — need to split into two movements
-- First update existing rotation movement
UPDATE movement_patterns SET 
  movement = 'Rotation (Fixed)',
  execution_points = ARRAY[
    'From a fixed rotated position — ribcage rotated either left or right and held almost directly above the pubic symphysis (mid pelvis)',
    'Pull the worked side of the ribcage down toward the pelvis',
    'At the same time flex the spine down toward the pelvis',
    'Control the eccentric — return to the fixed rotated starting position under control'
  ]
WHERE muscle_group = 'core' AND movement = 'Rotation';

-- Insert Rotation (Neutral into Rotation)
INSERT INTO movement_patterns (muscle_group, subdivision, movement, execution_points)
VALUES (
  'core',
  'core_rectus_abdominis',
  'Rotation (Neutral into Rotation)',
  ARRAY[
    'From a neutral or very slightly extended position',
    'Pull one side of the ribcage — either left or right — down toward the pelvis',
    'At the same time flex the spine down — bringing that one side of the ribcage toward the mid pelvis',
    'Control the eccentric — return to the starting position controlling the rotation as well'
  ]
) ON CONFLICT (muscle_group, COALESCE(subdivision, ''), movement) DO UPDATE
SET execution_points = EXCLUDED.execution_points;

-- Core Abs: Anti-Rotation
UPDATE movement_patterns SET execution_points = ARRAY[
  'Tense the abdominal musculature creating tension — pulling the ribcage and pelvis together',
  'Maintain a neutral spinal position — resisting rotation from an external force',
  'Breathe against the brace',
  'Do not allow the trunk to twist — the spine stays stable against the rotational demand'
] WHERE muscle_group = 'core' AND movement = 'Anti-Rotation';

-- Remove Lateral Flexion for now
DELETE FROM movement_patterns WHERE muscle_group = 'core' AND movement = 'Lateral Flexion';

-- Core Spinal Extensors: Spinal Extension
UPDATE movement_patterns SET execution_points = ARRAY[
  'Extend the spine from a flexed position — allow the spine to flex first then extend fully',
  'Focus on the spinal extension — not hip extension',
  'Control the movement — avoid momentum',
  'The concentric ends when the spine is fully extended or slightly hyperextended'
] WHERE muscle_group = 'core' AND movement = 'Spinal Extension';

-- Core Spinal Extensors: Anti-Flexion
UPDATE movement_patterns SET execution_points = ARRAY[
  'Tense the spinal erectors in order to maintain a neutral or extended spine against a force trying to flex it',
  'Do not allow the lower back to round',
  'Breathe against the brace',
  'Focus on holding position — the spine stays rigid'
] WHERE muscle_group = 'core' AND movement = 'Anti-Flexion';
