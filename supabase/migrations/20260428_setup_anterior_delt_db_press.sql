UPDATE exercise_library SET setup_points = ARRAY[
  'Set bench to highest incline before vertical — just under 90 degrees',
  'Rest the flat face of each dumbbell on your far thigh while standing',
  'Palms facing each other',
  'Kick dumbbells up one at a time using thigh momentum — do not try to curl them up',
  'Elbows slightly tucked in rather than flared — staying close to the scapular plane',
  'Unloading — When done, lift both knees to bring dumbbells back to your thighs and use the momentum to stand and re-rack safely',
  'Tip — Use thigh kick momentum on the way up — fighting it increases injury risk',
  'Tip — At failure, if you cannot bring the dumbbells to your thighs: check your surroundings are clear, then simply let the dumbbells drop forward from the starting position and immediately lift your feet off the floor. You are letting go — not throwing'
] WHERE name LIKE 'Anterior Delt DB%Press%';
