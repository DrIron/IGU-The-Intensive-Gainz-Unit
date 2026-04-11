-- Chest Clavicular Press
UPDATE movement_patterns SET execution_points = ARRAY[
  'Bring both humeri toward the inner third of the clavicle',
  'Full elbow extension during the concentric to allow the humerus to reach closer to the clavicular origin',
  'Control the eccentric — lower until the elbow passes just below shoulder level',
  'Slight scapular retraction during the eccentric to increase lengthened range of motion',
  'Focus on your humerus moving rather than your hands — the pectoral muscle acts on the humerus, not the hand'
], execution_text = 'Bring both humeri toward the inner third of the clavicle
Full elbow extension during the concentric to allow the humerus to reach closer to the clavicular origin
Control the eccentric — lower until the elbow passes just below shoulder level
Slight scapular retraction during the eccentric to increase lengthened range of motion
Focus on your humerus moving rather than your hands — the pectoral muscle acts on the humerus, not the hand'
WHERE muscle_group = 'pecs' AND subdivision = 'pecs_clavicular' AND movement = 'Press';

-- Chest Clavicular Fly
UPDATE movement_patterns SET execution_points = ARRAY[
  'Arc both humeri toward the inner third of the clavicle',
  'Full elbow extension to allow full range of motion as the humerus approaches the clavicular origin',
  'The stretch ends as the elbow passes below shoulder level',
  'Scapular retraction during the eccentric — more pronounced than in pressing movements',
  'Focus on the arc of your humerus, not your hands'
], execution_text = 'Arc both humeri toward the inner third of the clavicle
Full elbow extension to allow full range of motion as the humerus approaches the clavicular origin
The stretch ends as the elbow passes below shoulder level
Scapular retraction during the eccentric — more pronounced than in pressing movements
Focus on the arc of your humerus, not your hands'
WHERE muscle_group = 'pecs' AND subdivision = 'pecs_clavicular' AND movement = 'Fly';

-- Chest Clavicular Pressaround
UPDATE movement_patterns SET execution_points = ARRAY[
  'A cross-body unilateral press — press across the body to bring the humerus as close as possible to the clavicular origin',
  'Full elbow extension during the concentric to complete the range of motion',
  'Natural scapular protraction occurs and is expected — more than in presses or flys',
  'Control the eccentric as the elbow passes below shoulder level',
  'Focus on the humerus crossing toward the inner clavicle, not hand position'
], execution_text = 'A cross-body unilateral press — press across the body to bring the humerus as close as possible to the clavicular origin
Full elbow extension during the concentric to complete the range of motion
Natural scapular protraction occurs and is expected — more than in presses or flys
Control the eccentric as the elbow passes below shoulder level
Focus on the humerus crossing toward the inner clavicle, not hand position'
WHERE muscle_group = 'pecs' AND subdivision = 'pecs_clavicular' AND movement = 'Pressaround';

-- Chest Sternal Press
UPDATE movement_patterns SET execution_points = ARRAY[
  'Bring both humeri toward mid-sternum (middle of the chest bone)',
  'Full elbow extension during the concentric to allow the humerus to reach closer to the sternal origin',
  'Control the eccentric — stop as the elbow goes just below shoulder level',
  'Slight scapular retraction during the eccentric to increase lengthened range of motion',
  'Focus on your humerus moving rather than your hands — the pectoral muscle acts on the humerus, not the hand'
], execution_text = 'Bring both humeri toward mid-sternum (middle of the chest bone)
Full elbow extension during the concentric to allow the humerus to reach closer to the sternal origin
Control the eccentric — stop as the elbow goes just below shoulder level
Slight scapular retraction during the eccentric to increase lengthened range of motion
Focus on your humerus moving rather than your hands — the pectoral muscle acts on the humerus, not the hand'
WHERE muscle_group = 'pecs' AND subdivision = 'pecs_sternal' AND movement = 'Press';

-- Chest Sternal Fly
UPDATE movement_patterns SET execution_points = ARRAY[
  'Arc both humeri toward mid-sternum',
  'Full elbow extension to allow the humerus to reach closer to the sternal origin',
  'The eccentric ends as the elbow passes below shoulder level — degree varies person to person',
  'Scapular retraction during the eccentric — more pronounced than in pressing',
  'Focus on the arc of your humerus, not your hands'
], execution_text = 'Arc both humeri toward mid-sternum
Full elbow extension to allow the humerus to reach closer to the sternal origin
The eccentric ends as the elbow passes below shoulder level — degree varies person to person
Scapular retraction during the eccentric — more pronounced than in pressing
Focus on the arc of your humerus, not your hands'
WHERE muscle_group = 'pecs' AND subdivision = 'pecs_sternal' AND movement = 'Fly';

-- Chest Sternal Pressaround
UPDATE movement_patterns SET execution_points = ARRAY[
  'A cross-body unilateral press — press across the body to bring the humerus as close as possible to the sternal origin',
  'Full elbow extension during the concentric to complete the range of motion',
  'Natural scapular protraction occurs and is expected — significantly more than in presses or flys',
  'Control the eccentric as the elbow passes below shoulder level',
  'Focus on the humerus crossing toward mid-sternum, not hand position'
], execution_text = 'A cross-body unilateral press — press across the body to bring the humerus as close as possible to the sternal origin
Full elbow extension during the concentric to complete the range of motion
Natural scapular protraction occurs and is expected — significantly more than in presses or flys
Control the eccentric as the elbow passes below shoulder level
Focus on the humerus crossing toward mid-sternum, not hand position'
WHERE muscle_group = 'pecs' AND subdivision = 'pecs_sternal' AND movement = 'Pressaround';

-- Chest Costal Press
UPDATE movement_patterns SET execution_points = ARRAY[
  'Press down and in front — bring both humeri toward the lower portion of the sternum / costal region',
  'Full elbow extension during the concentric to allow the humerus to reach the costal origin',
  'The eccentric ends as the elbow passes the shoulder joint — degree varies person to person',
  'Slight scapular retraction during the eccentric to get more lengthened range of motion',
  'Focus on your humerus moving rather than your hands — the pectoral muscle acts on the humerus, not the hand'
], execution_text = 'Press down and in front — bring both humeri toward the lower portion of the sternum / costal region
Full elbow extension during the concentric to allow the humerus to reach the costal origin
The eccentric ends as the elbow passes the shoulder joint — degree varies person to person
Slight scapular retraction during the eccentric to get more lengthened range of motion
Focus on your humerus moving rather than your hands — the pectoral muscle acts on the humerus, not the hand'
WHERE muscle_group = 'pecs' AND subdivision = 'pecs_costal' AND movement = 'Press';

-- Chest Costal Fly
UPDATE movement_patterns SET execution_points = ARRAY[
  'Arc both humeri toward the lower sternum / costal region',
  'Full elbow extension to allow the humerus to reach the costal origin',
  'The eccentric ends as the elbow passes below shoulder level',
  'Scapular retraction during the eccentric — more pronounced than in pressing',
  'Focus on the arc of your humerus toward the lower sternum, not your hands'
], execution_text = 'Arc both humeri toward the lower sternum / costal region
Full elbow extension to allow the humerus to reach the costal origin
The eccentric ends as the elbow passes below shoulder level
Scapular retraction during the eccentric — more pronounced than in pressing
Focus on the arc of your humerus toward the lower sternum, not your hands'
WHERE muscle_group = 'pecs' AND subdivision = 'pecs_costal' AND movement = 'Fly';

-- Chest Costal Pressaround
UPDATE movement_patterns SET execution_points = ARRAY[
  'A cross-body unilateral press — press across the body to bring the humerus as close as possible to the lower sternum / costal origin',
  'Full elbow extension during the concentric to complete the range of motion',
  'Natural scapular protraction occurs and is expected — significantly more than in presses or flys',
  'Control the eccentric as the elbow passes below shoulder level',
  'Focus on the humerus crossing toward the lower sternum, not hand position'
], execution_text = 'A cross-body unilateral press — press across the body to bring the humerus as close as possible to the lower sternum / costal origin
Full elbow extension during the concentric to complete the range of motion
Natural scapular protraction occurs and is expected — significantly more than in presses or flys
Control the eccentric as the elbow passes below shoulder level
Focus on the humerus crossing toward the lower sternum, not hand position'
WHERE muscle_group = 'pecs' AND subdivision = 'pecs_costal' AND movement = 'Pressaround';
