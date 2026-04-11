-- Thoracic Row
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull shoulders down first, then pull humeri down and back',
  'Focus on pulling the humerus at all times — not the hands',
  'Slight scapular retraction at the end of the concentric',
  'The concentric ends as the elbow reaches the torso',
  'Control the eccentric — allow the humerus to travel forward under control'
], execution_text = 'Pull shoulders down first, then pull humeri down and back
Focus on pulling the humerus at all times — not the hands
Slight scapular retraction at the end of the concentric
The concentric ends as the elbow reaches the torso
Control the eccentric — allow the humerus to travel forward under control'
WHERE muscle_group = 'lats' AND subdivision = 'lats_thoracic' AND movement = 'Row';

-- Thoracic Pull Around
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull shoulder and humerus slightly down and back to start',
  'Continue the pull with your humerus keeping it close to your body',
  'Focus on pulling the humerus at all times',
  'Stop at the level of the spine'
], execution_text = 'Pull shoulder and humerus slightly down and back to start
Continue the pull with your humerus keeping it close to your body
Focus on pulling the humerus at all times
Stop at the level of the spine'
WHERE muscle_group = 'lats' AND subdivision = 'lats_thoracic' AND movement = 'Pull Around';

-- Lumbar Row
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull shoulders down first, then pull humeri down and back',
  'The cable setup pulls the humerus slightly upward toward the sternum — you are pulling against that, back and down',
  'Focus on pulling the humerus at all times — not the hands',
  'The concentric ends as the elbow reaches the torso',
  'Control the eccentric — allow the humerus to travel forward under control'
], execution_text = 'Pull shoulders down first, then pull humeri down and back
The cable setup pulls the humerus slightly upward toward the sternum — you are pulling against that, back and down
Focus on pulling the humerus at all times — not the hands
The concentric ends as the elbow reaches the torso
Control the eccentric — allow the humerus to travel forward under control'
WHERE muscle_group = 'lats' AND subdivision = 'lats_lumbar' AND movement LIKE 'Row%';

-- Lumbar Pull Around
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull shoulder and humerus slightly down and back to start',
  'Continue the pull with your humerus keeping it close to your body',
  'Focus on pulling the humerus at all times',
  'Stop at the level of the spine'
], execution_text = 'Pull shoulder and humerus slightly down and back to start
Continue the pull with your humerus keeping it close to your body
Focus on pulling the humerus at all times
Stop at the level of the spine'
WHERE muscle_group = 'lats' AND subdivision = 'lats_lumbar' AND movement = 'Pull Around';

-- Iliac Pulldown
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull shoulder and humerus slightly down and back to start',
  'Continue the pull with your humerus keeping it close to your body',
  'Focus on pulling the humerus and elbow down toward the hips',
  'Focus on pulling the humerus at all times',
  'Stop at the level of the spine'
], execution_text = 'Pull shoulder and humerus slightly down and back to start
Continue the pull with your humerus keeping it close to your body
Focus on pulling the humerus and elbow down toward the hips
Focus on pulling the humerus at all times
Stop at the level of the spine'
WHERE muscle_group = 'lats' AND subdivision = 'lats_iliac' AND movement LIKE 'Pulldown%';

-- Iliac Pull Around
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull shoulder and humerus slightly down and back to start',
  'Continue the pull with your humerus keeping it close to your body',
  'Focus on pulling the humerus and elbow down toward the hips',
  'Focus on pulling the humerus at all times',
  'Stop at the level of the spine'
], execution_text = 'Pull shoulder and humerus slightly down and back to start
Continue the pull with your humerus keeping it close to your body
Focus on pulling the humerus and elbow down toward the hips
Focus on pulling the humerus at all times
Stop at the level of the spine'
WHERE muscle_group = 'lats' AND subdivision = 'lats_iliac' AND movement = 'Pull Around';

-- Iliac Straight-Arm Pulldown / Pullover
UPDATE movement_patterns SET execution_points = ARRAY[
  'Arms can be semi-flexed for comfort — this is a shoulder extension arc, not an elbow movement',
  'The resistance pulls the humerus back and overhead',
  'Push the humerus out and to the front to start off the arc toward the back / spine',
  'Halfway through, transition to pulling the humerus down and back',
  'Focus on the arc of the humerus toward the spine from a side view',
  'Control the eccentric — allow the resistance to pull the humerus back overhead slowly'
], execution_text = 'Arms can be semi-flexed for comfort — this is a shoulder extension arc, not an elbow movement
The resistance pulls the humerus back and overhead
Push the humerus out and to the front to start off the arc toward the back / spine
Halfway through, transition to pulling the humerus down and back
Focus on the arc of the humerus toward the spine from a side view
Control the eccentric — allow the resistance to pull the humerus back overhead slowly'
WHERE muscle_group = 'lats' AND subdivision = 'lats_iliac' AND movement LIKE 'Straight-Arm%';
