-- Adds two T-Bar Row variants to the rhomboids family.
-- Both are chest-supported plate-loaded machine rows targeting mid/upper back.
-- Execution cues live on movement_patterns for upper_mid_back / mid_back_rhomboids
-- (seeded in 20260420), so these rows inherit them automatically — only setup_points
-- are written here.

-- 1. Mid-Back T-Bar Row — close/neutral grip
INSERT INTO public.exercise_library (
  name, primary_muscle, secondary_muscles, equipment, category,
  muscle_group, subdivision, movement_pattern, resistance_profiles,
  setup_points, is_global
) VALUES (
  'Rhomboids M T-Bar Row Mid-Back (M)',
  'Upper Back',
  ARRAY['Upper Traps', 'Rear Delts', 'Lats', 'Biceps'],
  'M',
  'strength',
  'upper_mid_back',
  'mid_back_rhomboids',
  'Row (retraction emphasis)',
  ARRAY['Mid-range'],
  ARRAY[
    'Adjust seat so the chest pad rests firmly on the sternum',
    'Top edge of the chest pad sits around mid sternum — leaves clearance from the neck',
    'Sit on the seat or stand off it as comfortable — what matters is solid chest contact and room to pull through full ROM',
    'Grip just wider than shoulder width — neutral / close handles',
    'Tip — At full contraction the upper arm sits ~45° from the torso, elbows tracking back and slightly out',
    'Tip — Feet flat, hips hinged, neutral spine — drive comes from the back, not from leaning',
    'Tip — Set pad height first, then test grip — if the chest slides off the pad mid-rep, the seat angle is wrong'
  ],
  true
) ON CONFLICT (name) DO NOTHING;

-- 2. Mid-Back T-Bar Row — wide grip
INSERT INTO public.exercise_library (
  name, primary_muscle, secondary_muscles, equipment, category,
  muscle_group, subdivision, movement_pattern, resistance_profiles,
  setup_points, is_global
) VALUES (
  'Rhomboids M T-Bar Row Wide Grip (M)',
  'Upper Back',
  ARRAY['Upper Traps', 'Rear Delts', 'Lats', 'Biceps'],
  'M',
  'strength',
  'upper_mid_back',
  'mid_back_rhomboids',
  'Row (retraction emphasis)',
  ARRAY['Mid-range'],
  ARRAY[
    'Adjust seat so the chest pad rests firmly on the sternum',
    'Top edge of the chest pad sits around mid sternum — leaves clearance from the neck',
    'Sit on the seat or stand off it as comfortable — what matters is solid chest contact and room to pull through full ROM',
    'Wide grip — hands well outside shoulder width, arms tracking out away from the body',
    'Tip — At full contraction the upper arm sits >60° from the torso, elbows just under shoulder level',
    'Tip — Feet flat, hips hinged, neutral spine — drive comes from the back, not from leaning',
    'Tip — Wider grip biases mid-back / rear delts more than the close-grip variant — squeeze the scapulae together hard at the top'
  ],
  true
) ON CONFLICT (name) DO NOTHING;
