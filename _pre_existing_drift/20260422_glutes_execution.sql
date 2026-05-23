-- Glute Max Hip Hinge
UPDATE movement_patterns SET execution_points = ARRAY[
  'Tense the glutes',
  'Allow the glutes to slowly let go — controlling the eccentric as the hips flex',
  'Maintain a neutral spine throughout',
  'Push the hips back as much as possible',
  'Contract the glutes to pull the hips into extension — pulling them up then in',
  'Careful not to exaggerate the eccentric and involve lower back muscles'
] WHERE muscle_group = 'glutes' AND subdivision = 'glutes_max' AND movement = 'Hip Hinge';

-- Glute Max Thrust
UPDATE movement_patterns SET execution_points = ARRAY[
  'Tense the glutes — allow them to control the eccentric as the hips flex into a full stretch',
  'Full ROM at the hip — allow for as much hip flexion as possible within the setup',
  'Contract the glutes to extend the hip — pulling the hips up and in',
  'Control the eccentric with the glutes'
] WHERE muscle_group = 'glutes' AND subdivision = 'glutes_max' AND movement LIKE 'Thrust%';

-- Glute Max Bridge (NEW — separate from thrust)
INSERT INTO movement_patterns (muscle_group, subdivision, movement, execution_points)
VALUES (
  'glutes',
  'glutes_max',
  'Bridge',
  ARRAY[
    'Tense the glutes — control the eccentric until you notice the knees moving back',
    'The eccentric ends just as the knees start moving back — the goal is to keep the shins straight up as if immovable pillars',
    'Some knee movement might be noticed but as soon as it does the glutes contract',
    'Glutes push the hip up and in during the concentric'
  ]
) ON CONFLICT (muscle_group, COALESCE(subdivision, ''), movement) DO UPDATE
SET execution_points = EXCLUDED.execution_points;

-- Glute Max Squat / Press
UPDATE movement_patterns SET execution_points = ARRAY[
  'Tense up the feet and leg musculature — as if the feet will grab onto the floor / platform',
  'Descend by pushing the hips back and down — controlling the descent with the glutes allowing for a full stretch',
  'ROM comes mostly from the hips',
  'Make sure the foot faces directly forward or slightly out as comfortable — knee tracks in line with the foot during the eccentric',
  'Contract the glutes pushing through the feet — bringing the hips into extension'
] WHERE muscle_group = 'glutes' AND subdivision = 'glutes_max' AND movement LIKE 'Squat%';

-- Glute Med Kickback (NEW)
INSERT INTO movement_patterns (muscle_group, subdivision, movement, execution_points)
VALUES (
  'glutes',
  'glutes_med',
  'Kickback',
  ARRAY[
    'Tense up the core musculature maintaining a neutral spine',
    'Tense up the non-working leg to stabilize in place — get a good foot grip',
    'Kickback and slightly abduct the working leg at an angle — extending the hip and pushing the leg slightly out',
    'Allow for the leg to return to starting position with control from the glutes'
  ]
) ON CONFLICT (muscle_group, COALESCE(subdivision, ''), movement) DO UPDATE
SET execution_points = EXCLUDED.execution_points;

-- Glute Med Extension (NEW)
INSERT INTO movement_patterns (muscle_group, subdivision, movement, execution_points)
VALUES (
  'glutes',
  'glutes_med',
  'Extension',
  ARRAY[
    'Tense up the core musculature maintaining a neutral spine',
    'Tense up the non-working leg to stabilize in place — get a good foot grip',
    'Extend the hip pushing the leg back and slightly out at approximately a 45 degree angle from the body in an arc motion',
    'Control the return to starting position with the glutes'
  ]
) ON CONFLICT (muscle_group, COALESCE(subdivision, ''), movement) DO UPDATE
SET execution_points = EXCLUDED.execution_points;

-- Glute Med Squat / Press (NEW)
INSERT INTO movement_patterns (muscle_group, subdivision, movement, execution_points)
VALUES (
  'glutes',
  'glutes_med',
  'Squat / Press',
  ARRAY[
    'Glutes control the descent — the hip is pushed back and down',
    'A slight lean forward can be applied to allow for a greater stretch on the glutes — maintaining a neutral spine',
    'Push through the foot extending the hip during the concentric',
    'Emphasis on maintaining the foot internal rotation angle — make sure the knee tracks in line with the foot during the eccentric'
  ]
) ON CONFLICT (muscle_group, COALESCE(subdivision, ''), movement) DO UPDATE
SET execution_points = EXCLUDED.execution_points;

-- Glute Min Abduction
UPDATE movement_patterns SET execution_points = ARRAY[
  'Abduct the leg away — maintaining an extended or semi-extended hip',
  'Control the return to starting position'
] WHERE muscle_group = 'glutes' AND subdivision = 'glutes_med' AND movement = 'Abduction';

-- Also insert for glute min if separate
INSERT INTO movement_patterns (muscle_group, subdivision, movement, execution_points)
VALUES (
  'glutes',
  'glutes_min',
  'Abduction',
  ARRAY[
    'Abduct the leg away — maintaining an extended or semi-extended hip',
    'Control the return to starting position'
  ]
) ON CONFLICT (muscle_group, COALESCE(subdivision, ''), movement) DO UPDATE
SET execution_points = EXCLUDED.execution_points;
