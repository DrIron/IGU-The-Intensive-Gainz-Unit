-- Lateral Delt Raise
UPDATE movement_patterns SET execution_points = ARRAY[
  'Initiate with abducting the arm away from the body',
  'Abduction is done in the scapular plane',
  'Allow natural scapular motion throughout — do not force it, but do not restrict it either',
  'Focus on the humerus moving — not the hands',
  'Careful not to initiate with the trapezius',
  'Careful not to exaggerate bringing the arm in front while attempting to get into the scapular plane — avoid turning it into a front raise'
], execution_text = 'Initiate with abducting the arm away from the body
Abduction is done in the scapular plane
Allow natural scapular motion throughout — do not force it, but do not restrict it either
Focus on the humerus moving — not the hands
Careful not to initiate with the trapezius
Careful not to exaggerate bringing the arm in front while attempting to get into the scapular plane — avoid turning it into a front raise'
WHERE muscle_group = 'shoulders' AND subdivision = 'shoulders_lateral' AND movement = 'Raise';

-- Lateral Delt Y-Raise
UPDATE movement_patterns SET execution_points = ARRAY[
  'Initiate with abducting the arms away from the body — push in a direction similar to where the lateral delt fibers point',
  'Once the humeri reach shoulder level, continue the upward motion forming a Y shape',
  'Pull the humeri back and down as if into the scapulae to reach the fully contracted position',
  'Focus on the humerus moving at all times',
  'Careful not to initiate with the trapezius'
], execution_text = 'Initiate with abducting the arms away from the body — push in a direction similar to where the lateral delt fibers point
Once the humeri reach shoulder level, continue the upward motion forming a Y shape
Pull the humeri back and down as if into the scapulae to reach the fully contracted position
Focus on the humerus moving at all times
Careful not to initiate with the trapezius'
WHERE muscle_group = 'shoulders' AND subdivision = 'shoulders_lateral' AND movement = 'Y-Raise';
