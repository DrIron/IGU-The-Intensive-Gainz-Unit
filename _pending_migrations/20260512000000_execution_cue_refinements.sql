-- ============================================================
-- Execution cue refinements — May 12 2026
-- Updates execution_points on movement_patterns for all 18
-- movements refined in the May 2026 cue review pass.
-- Corresponding markdown: IGU_MASTER_EXERCISE_LIBRARY_v2.md
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- SECTION 5: ELBOW FLEXORS
-- ──────────────────────────────────────────────────────────────

-- 5.1 Biceps Long Head — Curl (shoulder extended / lengthened)
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Keep the shoulder in its starting extended position — minor natural movement is fine, but do not let the elbow drift forward during the curl',
  'Pull the forearm toward the humerus — elbow flexion',
  'Maintain a supinated wrist position throughout — do not allow the wrist to fall into extension during the movement',
  'Control the eccentric — allow full elbow extension under control'
]
WHERE muscle_group = 'elbow_flexors'
  AND subdivision  = 'elbow_flexors_biceps_long'
  AND movement     = 'Curl (shoulder extended -- lengthened)';

-- 5.1 Biceps Long Head — Curl (shoulder neutral/flexed / shortened)
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Keep the shoulder in its setup position — do not let the elbow swing back behind the body during the curl',
  'Pull the forearm toward the humerus — elbow flexion',
  'Maintain a supinated wrist position throughout — do not allow the wrist to fall into extension during the movement',
  'Control the eccentric — allow full elbow extension under control'
]
WHERE muscle_group = 'elbow_flexors'
  AND subdivision  = 'elbow_flexors_biceps_long'
  AND movement     = 'Curl (shoulder neutral/flexed -- shortened)';

-- 5.2 Biceps Short Head — Curl (shoulder flexed / lengthened)
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Keep the arm in its forward-fixed position — do not allow the elbow to lift away or drift back during the curl',
  'Pull the forearm toward the humerus — elbow flexion',
  'Maintain a supinated wrist position throughout — do not allow the wrist to fall into extension during the movement',
  'Control the eccentric — allow full elbow extension under control'
]
WHERE muscle_group = 'elbow_flexors'
  AND subdivision  = 'elbow_flexors_biceps_short'
  AND movement     = 'Curl (shoulder flexed -- lengthened)';

-- 5.2 Biceps Short Head — Curl (shortened)
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Slightly tense the back to keep the shoulder in place',
  'Keep the upper arm fixed in place — do not allow the shoulder to swing; the setup position is what creates the shortened bias',
  'Pull the forearm toward the humerus — elbow flexion',
  'Maintain a supinated wrist position throughout — do not allow the wrist to fall into extension during the movement',
  'Control the eccentric — allow full elbow extension under control'
]
WHERE muscle_group = 'elbow_flexors'
  AND subdivision  = 'elbow_flexors_biceps_short'
  AND movement     = 'Curl (shortened)';


-- ──────────────────────────────────────────────────────────────
-- SECTION 6: ELBOW EXTENSORS (TRICEPS)
-- ──────────────────────────────────────────────────────────────

-- 6.1 Triceps Long Head — both scapular-plane movements share identical cues
-- Note: muscle_group in DB is 'triceps' (not 'elbow_extensors')
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Slightly tense the back to hold the shoulder in place',
  'Extend the forearm away from the humerus — fully extending the elbow joint',
  'Movement comes solely from the elbow',
  'Control the eccentric — allow the elbow to flex under control'
]
WHERE muscle_group = 'triceps'
  AND subdivision  = 'triceps_long'
  AND movement IN (
    'Overhead Extension (scapular plane)',
    'Extension with Shoulder Extension (scapular aligned)'
  );


-- ──────────────────────────────────────────────────────────────
-- SECTION 8: UPPER / MID BACK
-- ──────────────────────────────────────────────────────────────

-- 8.1 Upper Traps — Raise
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Initiate with wide lateral arm abduction — pulling the humeri outward and upward in a broad arc',
  'As the humeri pass shoulder level, continue the arc upward — allow the scapulae to upwardly rotate as the arms rise',
  'Focus on scapular elevation AND upward rotation at the top — both happen together',
  'Do not initiate with a shoulder shrug — the movement starts from the humerus, the scapula follows',
  'Control the eccentric — lower the arms while controlling scapular depression and downward rotation'
]
WHERE muscle_group = 'upper_mid_back'
  AND subdivision  = 'upper_back_upper_traps'
  AND movement     = 'Raise';

-- 8.2 Mid Traps — Retraction Row / Face Pull
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Pull both shoulders back — focus purely on retraction, do not elevate',
  'Scapulae are pulled directly back toward the spine',
  'The concentric ends when the scapulae are fully retracted',
  'Control the eccentric — allow the scapulae to protract forward under control'
]
WHERE muscle_group = 'upper_mid_back'
  AND subdivision  = 'mid_back_mid_traps'
  AND movement     = 'Retraction Row / Face Pull';

-- 8.3 Lower Traps — Pull-Apart
-- (was 'Scapular Depression'; renamed in 20260511000000_exercise_library_v2_sync migration)
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Begin with arms extended overhead in a wide Y position — scapulae are elevated and relatively neutral',
  'Lead with the scapulae — pull the shoulder blades DOWN and inward, driving from the bottom edge of the shoulder blade',
  'The arms follow as the scapulae move — resist the urge to initiate with the elbows or arms',
  'At full contraction, scapulae should be depressed, retracted, and slightly pulled back',
  'Control the eccentric — allow the scapulae to elevate and return slowly under control'
]
WHERE muscle_group = 'upper_mid_back'
  AND subdivision  = 'mid_back_low_traps'
  AND movement     = 'Pull-Apart';

-- 8.4 Rhomboids — Reverse Fly
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Lead with the scapulae — squeeze the shoulder blades together as the primary action',
  'The humeri pull back and apart as a consequence of scapular retraction — not the other way around',
  'Keep elbows slightly below shoulder level throughout — this targets rhomboids rather than posterior delts',
  'At full contraction, focus on the shoulder blades approaching each other — not just the arms being back',
  'Control the eccentric — allow the scapulae to protract slowly as the arms return to the front',
  'Distinction from posterior delt fly: here the shoulder blades drive the movement; in a posterior delt fly the humerus drives it'
]
WHERE muscle_group = 'upper_mid_back'
  AND subdivision  = 'mid_back_rhomboids'
  AND movement     = 'Reverse Fly';

-- 8.5 Teres Major — Pullover
-- (was 'Pulldown / Row (internal rotation emphasis)'; renamed in 20260511000000_exercise_library_v2_sync migration)
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Arms can be semi-flexed for comfort — this is a shoulder extension arc, not an elbow movement',
  'At the start position, the resistance holds the humerus back and overhead — this is the fully lengthened position',
  'Initiate the concentric by pulling the humerus DOWN and slightly in front of the body — not outward',
  'Continue the arc as the humerus sweeps downward toward the hips or torso level',
  'Focus on the arc of the humerus from overhead to in front in the sagittal plane — keep elbows tracking the same path throughout',
  'Control the eccentric — allow the humerus to arc back overhead slowly under control'
]
WHERE muscle_group = 'upper_mid_back'
  AND subdivision  = 'upper_back_teres_major'
  AND movement     = 'Pullover';


-- ──────────────────────────────────────────────────────────────
-- SECTION 10: CORE
-- ──────────────────────────────────────────────────────────────

-- 10.1 Abs — Rotation (Fixed)
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Begin in a fixed rotated position — ribcage rotated left or right and roughly centered over the mid pelvis',
  'From this rotated starting point, pull the worked side of the ribcage DOWN toward the pelvis',
  'Simultaneously flex the spine downward — spinal flexion and maintained rotation happen together',
  'Control the eccentric — return to the fixed rotated starting position under control; do not allow the trunk to unrotate on the way up'
]
WHERE muscle_group = 'core'
  AND subdivision  = 'core_rectus_abdominis'
  AND movement     = 'Rotation (Fixed)';

-- 10.1 Abs — Rotation (Neutral into Rotation)
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Begin in a neutral or very slightly extended spinal position',
  'Initiate with trunk rotation — pull one side of the ribcage diagonally toward the opposite hip in an arc',
  'Allow natural spinal flexion to accompany the rotation — both happen simultaneously, neither in isolation',
  'The endpoint is the ribcage fully rotated and the worked side pulled down and across toward the opposite pelvis',
  'Control the eccentric — unwind the rotation slowly back to neutral; resist the return, do not let it snap back'
]
WHERE muscle_group = 'core'
  AND subdivision  = 'core_rectus_abdominis'
  AND movement     = 'Rotation (Neutral into Rotation)';


-- ──────────────────────────────────────────────────────────────
-- SECTION 11: GLUTES
-- ──────────────────────────────────────────────────────────────

-- 11.1 Glute Max — Thrust
-- (was 'Thrust / Bridge'; renamed to 'Thrust' in 20260511000000_exercise_library_v2_sync migration)
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Tense the glutes — allow them to control the eccentric as the hips flex into a full stretch',
  'Full ROM at the hip — allow for as much hip flexion as possible within the setup',
  'Contract the glutes to extend the hip — drive the hips up to full lock-out, squeezing the glutes hard at the top',
  'Control the eccentric with the glutes — resist the descent and allow for a full hip flexion stretch at the bottom'
]
WHERE muscle_group = 'glutes'
  AND subdivision  = 'glutes_max'
  AND movement     = 'Thrust';

-- 11.1 Glute Max — Bridge
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Tense the glutes — control the descent as the hips lower toward the floor',
  'Stop the descent before the shins begin to tilt backward — maintain shins as close to vertical as possible throughout',
  'The shins act as fixed pillars: if they start angling back, the hips have gone too low',
  'Drive the hips up through the concentric — squeeze the glutes hard at full extension',
  'Control the return — do not drop the hips; lower under glute control'
]
WHERE muscle_group = 'glutes'
  AND subdivision  = 'glutes_max'
  AND movement     = 'Bridge';

-- 11.2 Glute Med — Kickback
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Tense up the core musculature and maintain a neutral spine throughout',
  'Plant the non-working foot firmly — this leg is your stable base',
  'Push the working leg back AND outward simultaneously — aim for approximately 20-30 degrees out from straight back',
  'The outward component is what biases the glute medius — avoid going straight back, which targets glute max',
  'Squeeze at full extension — the leg should be behind and out from the hip at the peak',
  'Control the return — bring the leg back to start with glute control, not momentum'
]
WHERE muscle_group = 'glutes'
  AND subdivision  = 'glutes_med'
  AND movement     = 'Kickback';

-- 11.2 Glute Med — Extension
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Tense up the core musculature and maintain a neutral spine throughout',
  'Plant the non-working foot firmly — this leg is your stable base',
  'From a neutral hip position, extend the leg in a controlled arc — targeting 45 degrees outward from the body, between straight back and pure abduction',
  'This combined extension and abduction angle preferentially loads the glute medius over the glute maximus',
  'Focus on a controlled arc — avoid momentum; the glute drives the entire motion',
  'Control the return — resist the pull back to neutral throughout the eccentric'
]
WHERE muscle_group = 'glutes'
  AND subdivision  = 'glutes_med'
  AND movement     = 'Extension';

-- 11.2 Glute Med — Squat / Press
UPDATE movement_patterns
SET execution_points = ARRAY[
  'Position the foot forward or very slightly inward — this creates mild internal hip rotation that biases the glute medius anterior fibers',
  'Maintain the knee tracking directly in line with the foot — do not allow the knee to cave inward at any point in the eccentric',
  'Keep the pelvis level throughout — the glute medius works to prevent the hip from dropping on the working side',
  'Control the descent — push the hip back and down allowing a full stretch; glute med controls pelvic stability throughout',
  'Drive through the foot during the concentric — focus on hip extension and maintaining a level pelvis, not just straightening the leg'
]
WHERE muscle_group = 'glutes'
  AND subdivision  = 'glutes_med'
  AND movement     = 'Squat / Press';
