UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull the thigh up toward the hip',
  'Focus on the knee driving up — not the foot',
  'Control the eccentric — allow the leg to come back down and slightly behind the body',
  'Allow full range of motion in the eccentric to stretch the hip flexor'
], execution_text = 'Pull the thigh up toward the hip
Focus on the knee driving up — not the foot
Control the eccentric — allow the leg to come back down and slightly behind the body
Allow full range of motion in the eccentric to stretch the hip flexor'
WHERE muscle_group = 'hip_flexors' AND movement = 'Hip Flexion';
