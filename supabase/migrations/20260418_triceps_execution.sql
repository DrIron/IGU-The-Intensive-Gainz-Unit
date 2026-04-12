-- Triceps Extension
UPDATE movement_patterns SET execution_points = ARRAY[
  'Slightly tense the back to hold the shoulder in place',
  'Pull the forearm away from the humerus — fully extending the elbow joint',
  'Movement comes solely from the elbow',
  'Control the eccentric — allow the elbow to flex under control'
] WHERE muscle_group = 'triceps' AND movement LIKE 'Overhead Extension%';

UPDATE movement_patterns SET execution_points = ARRAY[
  'Slightly tense the back to hold the shoulder in place',
  'Pull the forearm away from the humerus — fully extending the elbow joint',
  'Movement comes solely from the elbow',
  'Control the eccentric — allow the elbow to flex under control'
] WHERE muscle_group = 'triceps' AND movement LIKE 'Extension with%';

-- Triceps Pressdown
UPDATE movement_patterns SET execution_points = ARRAY[
  'Slightly tense the back to hold the shoulder in place',
  'Push the forearm down — fully extending the elbow joint',
  'Movement comes solely from the elbow',
  'Control the eccentric — allow the elbow to flex under control'
] WHERE muscle_group = 'triceps' AND movement LIKE 'Pushdown%';

-- Tricep Press
UPDATE movement_patterns SET execution_points = ARRAY[
  'A push and extend movement — involves both the shoulder joint and the elbow joint',
  'Initiate shoulder flexion concurrently with the initiation of elbow extension',
  'The sole purpose of the shoulder flexion is to allow for more elbow extension — giving a resultant press and extend',
  'Control the eccentric'
] WHERE muscle_group = 'triceps' AND movement LIKE 'Extension / Press%';
