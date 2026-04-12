-- ADDUCTORS
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull the leg toward the midline',
  'Control the return with the adductors — allow the leg to abduct back under control',
  'Maintain pelvic stability throughout'
] WHERE muscle_group = 'adductors' AND movement = 'Adduction';

-- ABDUCTORS (TFL)
UPDATE movement_patterns SET execution_points = ARRAY[
  'Abduct the hip with slight internal rotation — toes turned slightly inward',
  'Push the leg away from the midline',
  'Control the return to starting position'
] WHERE muscle_group = 'abductors' AND movement LIKE 'Internal%';

-- QUADRICEPS Knee Extension
UPDATE movement_patterns SET execution_points = ARRAY[
  'Push the legs up — maintaining lower back and pelvic stability',
  'Fully extend the knee — fully contract the quads as if bringing the knees in toward the hip',
  'Control the way down'
] WHERE muscle_group = 'quads' AND movement LIKE 'Knee Extension%';

-- QUADRICEPS Squat
UPDATE movement_patterns SET execution_points = ARRAY[
  'Tense up the feet and leg musculature — as if the feet will grab onto the floor / platform',
  'Descend by pushing the knees out — getting as much knee ROM as possible',
  'Make sure the knees track in line with the toes',
  'Drive through the quads during the concentric — focus on knee extension',
  'Full depth as mobility allows'
] WHERE muscle_group = 'quads' AND movement = 'Squat';

-- HAMSTRINGS Leg Curl
UPDATE movement_patterns SET execution_points = ARRAY[
  'Tense the glutes and abs slightly to keep the pelvis in place',
  'Flex the knee — bringing the heel toward the glute',
  'Focus on the knee flexion — the hamstrings drive the movement',
  'Control the eccentric — allow the knee to extend back under control',
  'Full range of motion in both directions',
  'Tip: if feeling the calves too much — dorsiflex the feet during the eccentric (pull the feet up, opposite of pressing a gas pedal)'
] WHERE muscle_group = 'hamstrings' AND movement = 'Leg Curl';

-- HAMSTRINGS Hip Hinge
UPDATE movement_patterns SET execution_points = ARRAY[
  'Tense the hamstrings',
  'Allow the hamstrings to control the eccentric as the hips flex',
  'Maintain straight knees with minimal leeway for knee flexion — absolute minimum',
  'Push the hips back getting a good hamstring stretch',
  'Maintain a neutral spine throughout',
  'Contract the hamstrings and glutes to pull the hips into extension',
  'Careful not to exaggerate the descent and involve the spinal erectors'
] WHERE muscle_group = 'hamstrings' AND movement LIKE 'Hip Hinge%';

-- CALVES Gastrocnemius
UPDATE movement_patterns SET execution_points = ARRAY[
  'Push the foot down and push the ankle to the front — full plantar flexion',
  'Keep the knee straight — the gastrocnemius is most effective with knee extended',
  'Control the eccentric — allow full dorsiflexion at the bottom for a full stretch',
  'Full range of motion — do not bounce at the bottom'
] WHERE muscle_group = 'calves' AND movement LIKE 'Calf Raise (knee straight%';

-- CALVES Soleus
UPDATE movement_patterns SET execution_points = ARRAY[
  'Push the foot down and push the ankle to the front — full plantar flexion',
  'Keep the knee bent — the soleus is emphasized with knee flexed',
  'Control the eccentric — allow full dorsiflexion at the bottom for a full stretch',
  'Full range of motion'
] WHERE muscle_group = 'calves' AND movement LIKE 'Calf Raise (knee bent%';

-- CALVES Tibialis
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull the foot up and pull the ankle down — full dorsiflexion',
  'Control the eccentric — allow plantar flexion back slowly',
  'Full range of motion'
] WHERE muscle_group = 'calves' AND movement = 'Dorsiflexion';

-- NECK Flexion / Extension
UPDATE movement_patterns SET execution_points = ARRAY[
  'Flex or extend the cervical spine in a controlled manner',
  'Focus on the neck muscles driving the movement — not momentum',
  'Control the eccentric in both directions',
  'Do not use excessive range of motion — stay within a comfortable range'
] WHERE muscle_group = 'neck' AND movement LIKE 'Flexion%';

-- NECK Lateral Flexion
UPDATE movement_patterns SET execution_points = ARRAY[
  'Laterally flex the cervical spine — bring the ear toward the shoulder',
  'Focus on the neck muscles driving the movement',
  'Control the eccentric — return to neutral under control',
  'Do not rotate — keep the movement purely lateral'
] WHERE muscle_group = 'neck' AND movement = 'Lateral Flexion';

-- ROTATOR CUFF Scaption
UPDATE movement_patterns SET execution_points = ARRAY[
  'Abduct the arm in the scapular plane — approximately 30 degrees in front of the frontal plane',
  'Focus on the initial portion of abduction',
  'Control the movement — avoid momentum',
  'Allow natural scapular motion'
] WHERE muscle_group = 'rotator_cuff' AND movement LIKE 'Scaption%';

-- ROTATOR CUFF External Rotation
UPDATE movement_patterns SET execution_points = ARRAY[
  'Externally rotate the humerus — the forearm moves outward',
  'Movement comes solely from rotation of the humerus — not from the elbow or shoulder',
  'Control the eccentric — allow the humerus to internally rotate back slowly',
  'Slightly tense the back for stability'
] WHERE muscle_group = 'rotator_cuff' AND movement = 'External Rotation';

-- ROTATOR CUFF Internal Rotation
UPDATE movement_patterns SET execution_points = ARRAY[
  'Internally rotate the humerus — the forearm moves inward',
  'Movement comes solely from rotation of the humerus — not from the elbow or shoulder',
  'Control the eccentric — allow the humerus to externally rotate back slowly',
  'Slightly tense the back for stability'
] WHERE muscle_group = 'rotator_cuff' AND movement = 'Internal Rotation';

-- SERRATUS Protraction
UPDATE movement_patterns SET execution_points = ARRAY[
  'Push the scapula forward around the ribcage — protraction is the primary action',
  'In push-up plus variations — perform a full push-up then continue pushing the shoulders forward at the top',
  'Focus on the scapular movement — not the arms',
  'Control the eccentric — allow the scapulae to retract back slowly'
] WHERE muscle_group = 'serratus' AND movement = 'Protraction';

-- HIP FLEXORS already done earlier

-- ADDUCTORS also update if subdivision specific
UPDATE movement_patterns SET execution_points = ARRAY[
  'Pull the leg toward the midline',
  'Control the return with the adductors — allow the leg to abduct back under control',
  'Maintain pelvic stability throughout'
] WHERE muscle_group = 'adductors';
