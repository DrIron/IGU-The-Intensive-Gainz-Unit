-- Forearm Wrist Curl
UPDATE movement_patterns SET execution_points = ARRAY[
  'Curl the wrist upward — bringing the palm toward the forearm',
  'Full range of motion — allow the wrist to extend fully in the eccentric',
  'Control the eccentric'
] WHERE muscle_group = 'forearm' AND movement = 'Wrist Curl';

-- Forearm Reverse Wrist Curl
UPDATE movement_patterns SET execution_points = ARRAY[
  'Extend the wrist upward — bringing the back of the hand toward the forearm',
  'Full range of motion — allow the wrist to flex fully in the eccentric',
  'Control the eccentric'
] WHERE muscle_group = 'forearm' AND movement = 'Reverse Wrist Curl';

-- Forearm Pronation
UPDATE movement_patterns SET execution_points = ARRAY[
  'Movement comes from rotating the forearm inward',
  'Focus on the rotation — not the grip',
  'Control the eccentric — allow supination back slowly'
] WHERE muscle_group = 'forearm' AND movement = 'Pronation';

-- Forearm Supination
UPDATE movement_patterns SET execution_points = ARRAY[
  'Movement comes from rotating the forearm outward',
  'Focus on the rotation — not the grip',
  'Control the eccentric — allow pronation back slowly'
] WHERE muscle_group = 'forearm' AND movement = 'Supination';

-- Upper Traps Shrug
UPDATE movement_patterns SET execution_points = ARRAY[
  'Elevate the shoulders up and slightly back — as if bringing the shoulders up toward and slightly behind the ears',
  'Control the eccentric — allow the shoulders to depress fully under control',
  'Do not roll the shoulders — up and slightly back'
] WHERE muscle_group = 'upper_mid_back' AND subdivision = 'upper_back_upper_traps' AND movement = 'Shrug';

-- Upper Traps Raise (NEW movement — insert if not exists)
INSERT INTO movement_patterns (muscle_group, subdivision, movement, execution_points)
VALUES (
  'upper_mid_back',
  'upper_back_upper_traps',
  'Raise',
  ARRAY[
    'Pull humeri in an arc motion at a wide angle in close proximity or within the scapular plane',
    'Pull the shoulders up and above — allow for full scapular movement rotating upward as humeri are pulled up and above the shoulders',
    'Control the eccentric'
  ]
) ON CONFLICT (muscle_group, COALESCE(subdivision, ''), movement) DO UPDATE
SET execution_points = EXCLUDED.execution_points;

-- Mid Traps Retraction Row / Face Pull
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull both shoulders back and slightly upward',
  'Scapulae are pulled up and back',
  'The concentric ends when the scapulae are fully retracted',
  'Control the eccentric — allow the scapulae to protract back under control'
] WHERE muscle_group = 'upper_mid_back' AND subdivision = 'mid_back_mid_traps' AND movement LIKE 'Retraction%';
