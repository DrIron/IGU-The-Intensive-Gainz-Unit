-- Lower Traps Scapular Depression
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull the shoulders down and back',
  'Focus on scapular movement — allow them to pull down and in',
  'Control the eccentric'
] WHERE muscle_group = 'upper_mid_back' AND subdivision = 'mid_back_low_traps' AND movement LIKE 'Scapular%';

-- Rhomboids Row
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull the humeri back and apart',
  'When reaching torso level — pull more back and in together',
  'Focus on pulling the shoulder blades / scapulae together — squeezing the mid-back musculature',
  'Control the eccentric'
] WHERE muscle_group = 'upper_mid_back' AND subdivision = 'mid_back_rhomboids' AND movement LIKE 'Row%';

-- Rhomboids Reverse Fly (NEW — insert if not exists)
INSERT INTO movement_patterns (muscle_group, subdivision, movement, execution_points)
VALUES (
  'upper_mid_back',
  'mid_back_rhomboids',
  'Reverse Fly',
  ARRAY[
    'Pull humeri back and apart in an arc motion',
    'Until reaching torso level — pull more back and in toward each other',
    'Allow and focus on scapular / shoulder blade retraction — squeezing the mid-back musculature as much as possible',
    'Control the eccentric'
  ]
) ON CONFLICT (muscle_group, COALESCE(subdivision, ''), movement) DO UPDATE
SET execution_points = EXCLUDED.execution_points;

-- Teres Major Row (NEW — insert if not exists)
INSERT INTO movement_patterns (muscle_group, subdivision, movement, execution_points)
VALUES (
  'upper_mid_back',
  'upper_back_teres_major',
  'Row',
  ARRAY[
    'Pull the humeri down and in toward the shoulder blades and back',
    'Wrist can be fixed in a position between neutral to pronated',
    'Control the eccentric'
  ]
) ON CONFLICT (muscle_group, COALESCE(subdivision, ''), movement) DO UPDATE
SET execution_points = EXCLUDED.execution_points;

-- Teres Major Reverse Fly (NEW — insert if not exists)
INSERT INTO movement_patterns (muscle_group, subdivision, movement, execution_points)
VALUES (
  'upper_mid_back',
  'upper_back_teres_major',
  'Reverse Fly',
  ARRAY[
    'Pull the humeri down and in toward the shoulder blades and back in an arc motion',
    'Wrist can be fixed in a position between neutral to pronated',
    'Control the eccentric'
  ]
) ON CONFLICT (muscle_group, COALESCE(subdivision, ''), movement) DO UPDATE
SET execution_points = EXCLUDED.execution_points;

-- Update existing teres major pulldown movement if it exists
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull the humeri down and in toward the shoulder blades and back',
  'Wrist can be fixed in a position between neutral to pronated',
  'Control the eccentric'
] WHERE muscle_group = 'upper_mid_back' AND subdivision = 'upper_back_teres_major' AND movement LIKE 'Pulldown%';
