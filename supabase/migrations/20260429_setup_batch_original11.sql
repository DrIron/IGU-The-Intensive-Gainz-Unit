-- Sternal Pec DB Flat Press
UPDATE exercise_library SET setup_points = ARRAY[
  'Bench set up flat — parallel to the floor',
  'Place dumbbells in front of bench',
  'Pick dumbbells up safely one by one',
  'Place dumbbells on mid thigh area — sit down with dumbbells remaining on thighs',
  'Kick up with both feet simultaneously — use the weight of the dumbbell to rock into lying position',
  'Bring both feet down and on the floor',
  'Elbows should be below shoulder level',
  'Unloading — lift both knees to bring dumbbells back to thighs and use momentum to sit up',
  'Tip — Use thigh kick momentum — do not try to curl the dumbbells up',
  'Tip — At failure from the bottom position: check surroundings are clear, let dumbbells drop to the sides safely'
] WHERE name LIKE 'Sternal Pec DB Flat Press%';

-- Costal Pec C-AA Standing Press
UPDATE exercise_library SET setup_points = ARRAY[
  'Cable height adjusted to above shoulder level — try two levels higher and adjust with trial and error',
  'Cable width (if adjustable) should be wider than shoulder width apart — try two levels wider and adjust with trial and error',
  'If the machine does not have a back pad for support — place one foot in front to help stabilize',
  'For balance — try switching feet between sets',
  'Get into pressing position — grab the cable one hand at a time',
  'Tip — Help yourself by grabbing the first cable with both hands, then use your bodyweight to bring the second cable down — avoids getting into uncomfortable positions',
  'Tip — If setup is correct the cable runs parallel to your forearm almost throughout the entire movement'
] WHERE name LIKE 'Costal Pec C-AA Standing%Press%';

-- Clavicular Pec M Incline Press
UPDATE exercise_library SET setup_points = ARRAY[
  'Empty the machine or apply lowest weight',
  'Assess the machine path of motion — adjust seat position until the humerus pushes toward the inner clavicle in a low to high angle',
  'Grip width places wrists right over or slightly in relative to the elbow',
  'Slight back tension to have a stable base on the machine back support — do not exaggerate an arch, just a bit of tension',
  'Tip — Small seat adjustments significantly change the pressing angle — test with light weight before loading'
] WHERE name LIKE 'Clavicular Pec M Incline Press%' OR name LIKE 'Clavicular Pec M%Press%';

-- Iliac Lat Pulldown (classic pulldown machine) — also rename
UPDATE exercise_library SET 
  name = REPLACE(name, 'Close Underhand', 'Close Neutral/Semi Supinated'),
  setup_points = ARRAY[
    'Narrow grip width — shoulder width or slightly narrower as comfortable / attachment availability',
    'Neutral (palms facing each other) / Semi supinated (palms slightly angled up) grip',
    'Front to mid thigh held in place by thigh pad',
    'Slightly lean back from the hips — to allow the cable line of pull to pull the humerus up and slightly in front as well'
  ]
WHERE name LIKE 'Iliac Lat M Close%Pulldown%';

-- Iliac Lat Pullaround (classic pulldown machine)
UPDATE exercise_library SET setup_points = ARRAY[
  'If cable machine has two cables — use the cable opposite to the side worked',
  'Place non-working sides thigh under the pad',
  'Turn entire body including pelvis toward the working side',
  'Slightly lean back from the hips',
  'Cable should pull the humerus across toward the clavicle'
] WHERE name LIKE 'Iliac Lat%Pull Around%' AND (equipment = 'C-FT' OR equipment = 'C-AA');

-- Thoracic Lat Pullaround (seated cable row machine)
UPDATE exercise_library SET setup_points = ARRAY[
  'If cable machine has two cables — use the cable opposite to the side worked',
  'Place non-working sides foot on the platform',
  'Tilt entire body including pelvis toward the working side',
  'Working sides leg slightly extends to avoid getting in the way',
  'Slightly lean back from the hips',
  'Cable should pull the humerus across the lower sternum / lower chest'
] WHERE name LIKE 'Thoracic Lat%Pull Around%';

-- Lumbar Lat Pullaround (seated cable row machine)
UPDATE exercise_library SET setup_points = ARRAY[
  'If cable machine has two cables — use the cable opposite to the side worked',
  'Place non-working sides foot on the platform',
  'Tilt entire body including pelvis toward the working side',
  'Working sides leg slightly extends to avoid getting in the way',
  'Slightly lean forward from the hips',
  'Cable should pull the humerus across the mid sternum / mid chest'
] WHERE name LIKE 'Lumbar Lat%Pull Around%';

-- Hip Flexors M Standing Leg Raise
UPDATE exercise_library SET setup_points = ARRAY[
  'Pad height around mid thigh',
  'Pad angle either vertical pointing straight down or slightly angled more toward the body — to provide tension from the start',
  'Grab onto the handles for stability',
  'Tip — You might need to slightly bend forward with heavy weights'
] WHERE name LIKE 'Hip Flexors M%Leg Raise%' OR name LIKE 'Hip Flexors M%Hip Flexion%';

-- Hip Flexors C-FT Lying Leg Raise
UPDATE exercise_library SET setup_points = ARRAY[
  'Cable set at low height',
  'Cable set in front of the non-trained side — to pull down and slightly across',
  'Move away to allow for tension at the start',
  'Non-trained leg bent and stabilized to the side',
  'Arms on the floor'
] WHERE name LIKE 'Hip Flexors C-FT%' AND (name LIKE '%Lying%' OR name LIKE '%Cable%');

-- Lateral Delt DB Standing Lateral Raise
UPDATE exercise_library SET setup_points = ARRAY[
  'Place dumbbells on the anterolateral thigh — helps show direction of abduction',
  'Keep the elbows slightly bent or extended'
] WHERE name LIKE 'Lateral Delt DB%Lateral Raise%';

-- Lateral Delt C-FT Lateral Raise
UPDATE exercise_library SET setup_points = ARRAY[
  'Stand with arm straight by your side — set cable height to the option just below the level of your hand in this position',
  'Tilt the body slightly toward or away from the cable so that the cable runs under the arm throughout',
  'Keep the elbows slightly bent or extended'
] WHERE name LIKE 'Lateral Delt C-FT%Lateral Raise%';
