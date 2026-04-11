-- Anterior Delt Press
UPDATE movement_patterns SET execution_points = ARRAY[
  'Press both humeri upward and in',
  'Elbows slightly brought in, in close proximity to the scapular plane — wherever comfortable',
  'Full elbow extension during the concentric to allow the humerus to reach full overhead position',
  'Allow natural scapular upward rotation as the arms go overhead — do not restrict it',
  'Allow scapular retraction during the eccentric',
  'Control the eccentric — lower until the elbow passes just below shoulder level',
  'Focus on the humerus moving — not the hands'
] WHERE muscle_group = 'shoulders' AND subdivision = 'shoulders_anterior' AND movement = 'Press';

-- Anterior Delt Raise
UPDATE movement_patterns SET execution_points = ARRAY[
  'Raise the humerus up and in, in an arc motion, in close proximity to the scapular plane — wherever comfortable',
  'Focus on the humerus moving — not the hands or the weight',
  'Allow natural scapular motion — do not force it, but do not restrict it either',
  'Careful not to initiate with the trapezius',
  'Control the eccentric'
] WHERE muscle_group = 'shoulders' AND subdivision = 'shoulders_anterior' AND movement = 'Raise';

-- Posterior Delt Reverse Fly
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull both humeri back and apart at a comfortable angle where elbows are below shoulder level',
  'Focus on shoulder extension — pull the humerus back as much as possible and as if slightly pulling the humeri in toward each other at the end of the motion when targeting a full contraction',
  'Focus on the humerus moving — not the hands',
  'Allow natural scapular retraction throughout the movement',
  'The concentric ends as the humerus reaches approximately in line with the torso',
  'Control the eccentric — allow the humeri to travel forward under control',
  'Careful not to initiate with the mid-back — the movement starts from the humerus'
] WHERE muscle_group = 'shoulders' AND subdivision = 'shoulders_posterior' AND movement = 'Reverse Fly';

-- Elbow Flexors: Curl (Fixed Supination) — targeting biceps both heads
UPDATE movement_patterns SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Pull the forearm toward the humerus — elbow flexion',
  'Maintain a supinated wrist position throughout — do not allow the wrist to fall into extension during the movement',
  'Control the eccentric — allow full elbow extension under control'
] WHERE muscle_group = 'elbow_flexors' AND movement LIKE 'Curl (shoulder extended%';

-- Also update the shortened curl for long head
UPDATE movement_patterns SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Pull the forearm toward the humerus — elbow flexion',
  'Maintain a supinated wrist position throughout — do not allow the wrist to fall into extension during the movement',
  'Control the eccentric — allow full elbow extension under control'
] WHERE muscle_group = 'elbow_flexors' AND movement LIKE 'Curl (shoulder neutral%';

-- Short head lengthened curl
UPDATE movement_patterns SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Pull the forearm toward the humerus — elbow flexion',
  'Maintain a supinated wrist position throughout — do not allow the wrist to fall into extension during the movement',
  'Control the eccentric — allow full elbow extension under control'
] WHERE muscle_group = 'elbow_flexors' AND movement LIKE 'Curl (shoulder flexed%';

-- Short head shortened curl
UPDATE movement_patterns SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Pull the forearm toward the humerus — elbow flexion',
  'Maintain a supinated wrist position throughout — do not allow the wrist to fall into extension during the movement',
  'Control the eccentric — allow full elbow extension under control'
] WHERE muscle_group = 'elbow_flexors' AND movement LIKE 'Curl (shortened%';

-- Biceps Omni curl
UPDATE movement_patterns SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Pull the forearm toward the humerus — elbow flexion',
  'Maintain a supinated wrist position throughout — do not allow the wrist to fall into extension during the movement',
  'Control the eccentric — allow full elbow extension under control'
] WHERE muscle_group = 'elbow_flexors' AND subdivision IS NULL AND movement = 'Curl';

-- Brachialis: Hammer / Reverse Curl (Fixed Neutral)
UPDATE movement_patterns SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Pull the forearm toward the humerus — elbow flexion',
  'Maintain a neutral wrist position throughout — do not allow the wrist to fall into extension during the movement',
  'Control the eccentric — allow full elbow extension under control'
] WHERE muscle_group = 'elbow_flexors' AND subdivision = 'elbow_flexors_brachialis' AND movement LIKE 'Hammer%';

-- Brachioradialis: Reverse Curl (Pronation to Neutral)
UPDATE movement_patterns SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Pull the forearm toward the humerus — elbow flexion',
  'Begin with a pronated wrist position — rotate to neutral during the concentric',
  'Allow the opposite during the eccentric — return from neutral to pronated on the way back',
  'Control the eccentric — allow full elbow extension under control'
] WHERE muscle_group = 'elbow_flexors' AND subdivision = 'elbow_flexors_brachioradialis';
