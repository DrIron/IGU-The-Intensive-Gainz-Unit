-- Seed exercise library with ~100 common exercises
-- All exercises are global (is_global = true, created_by_coach_id = NULL)
-- Categories: strength, cardio, mobility, physio, warmup, cooldown

INSERT INTO public.exercise_library (name, primary_muscle, secondary_muscles, equipment, category, is_global, created_by_coach_id)
VALUES

-- =========================================
-- COMPOUND LIFTS
-- =========================================
('Barbell Back Squat', 'Quadriceps', ARRAY['Glutes', 'Hamstrings', 'Core'], 'Barbell', 'strength', true, NULL),
('Barbell Front Squat', 'Quadriceps', ARRAY['Glutes', 'Core', 'Upper Back'], 'Barbell', 'strength', true, NULL),
('Barbell Deadlift', 'Hamstrings', ARRAY['Glutes', 'Lower Back', 'Traps', 'Core'], 'Barbell', 'strength', true, NULL),
('Sumo Deadlift', 'Glutes', ARRAY['Hamstrings', 'Adductors', 'Lower Back', 'Core'], 'Barbell', 'strength', true, NULL),
('Romanian Deadlift', 'Hamstrings', ARRAY['Glutes', 'Lower Back'], 'Barbell', 'strength', true, NULL),
('Barbell Bench Press', 'Chest', ARRAY['Triceps', 'Front Delts'], 'Barbell', 'strength', true, NULL),
('Incline Barbell Bench Press', 'Upper Chest', ARRAY['Triceps', 'Front Delts'], 'Barbell', 'strength', true, NULL),
('Barbell Overhead Press', 'Shoulders', ARRAY['Triceps', 'Upper Chest', 'Core'], 'Barbell', 'strength', true, NULL),
('Barbell Bent-Over Row', 'Upper Back', ARRAY['Lats', 'Biceps', 'Rear Delts'], 'Barbell', 'strength', true, NULL),
('Barbell Hip Thrust', 'Glutes', ARRAY['Hamstrings', 'Core'], 'Barbell', 'strength', true, NULL),

-- =========================================
-- DUMBBELL COMPOUND
-- =========================================
('Dumbbell Bench Press', 'Chest', ARRAY['Triceps', 'Front Delts'], 'Dumbbells', 'strength', true, NULL),
('Incline Dumbbell Bench Press', 'Upper Chest', ARRAY['Triceps', 'Front Delts'], 'Dumbbells', 'strength', true, NULL),
('Dumbbell Shoulder Press', 'Shoulders', ARRAY['Triceps', 'Upper Chest'], 'Dumbbells', 'strength', true, NULL),
('Dumbbell Row', 'Lats', ARRAY['Upper Back', 'Biceps', 'Rear Delts'], 'Dumbbells', 'strength', true, NULL),
('Dumbbell Lunges', 'Quadriceps', ARRAY['Glutes', 'Hamstrings'], 'Dumbbells', 'strength', true, NULL),
('Dumbbell Bulgarian Split Squat', 'Quadriceps', ARRAY['Glutes', 'Hamstrings'], 'Dumbbells', 'strength', true, NULL),
('Dumbbell Romanian Deadlift', 'Hamstrings', ARRAY['Glutes', 'Lower Back'], 'Dumbbells', 'strength', true, NULL),
('Goblet Squat', 'Quadriceps', ARRAY['Glutes', 'Core'], 'Dumbbell', 'strength', true, NULL),

-- =========================================
-- CHEST ISOLATION
-- =========================================
('Dumbbell Fly', 'Chest', ARRAY['Front Delts'], 'Dumbbells', 'strength', true, NULL),
('Incline Dumbbell Fly', 'Upper Chest', ARRAY['Front Delts'], 'Dumbbells', 'strength', true, NULL),
('Cable Crossover', 'Chest', ARRAY['Front Delts'], 'Cable Machine', 'strength', true, NULL),
('Pec Deck Machine', 'Chest', ARRAY['Front Delts'], 'Machine', 'strength', true, NULL),

-- =========================================
-- BACK ISOLATION
-- =========================================
('Lat Pulldown', 'Lats', ARRAY['Biceps', 'Upper Back'], 'Cable Machine', 'strength', true, NULL),
('Seated Cable Row', 'Upper Back', ARRAY['Lats', 'Biceps', 'Rear Delts'], 'Cable Machine', 'strength', true, NULL),
('Pull-Up', 'Lats', ARRAY['Biceps', 'Upper Back', 'Core'], 'Pull-Up Bar', 'strength', true, NULL),
('Chin-Up', 'Lats', ARRAY['Biceps', 'Upper Back'], 'Pull-Up Bar', 'strength', true, NULL),
('T-Bar Row', 'Upper Back', ARRAY['Lats', 'Biceps', 'Rear Delts'], 'T-Bar', 'strength', true, NULL),
('Face Pull', 'Rear Delts', ARRAY['Upper Back', 'Rotator Cuff'], 'Cable Machine', 'strength', true, NULL),
('Straight-Arm Pulldown', 'Lats', ARRAY['Teres Major', 'Core'], 'Cable Machine', 'strength', true, NULL),
('Chest-Supported Row', 'Upper Back', ARRAY['Lats', 'Biceps', 'Rear Delts'], 'Dumbbells', 'strength', true, NULL),

-- =========================================
-- SHOULDERS
-- =========================================
('Lateral Raise', 'Side Delts', ARRAY['Traps'], 'Dumbbells', 'strength', true, NULL),
('Cable Lateral Raise', 'Side Delts', ARRAY['Traps'], 'Cable Machine', 'strength', true, NULL),
('Front Raise', 'Front Delts', ARRAY['Upper Chest'], 'Dumbbells', 'strength', true, NULL),
('Rear Delt Fly', 'Rear Delts', ARRAY['Upper Back'], 'Dumbbells', 'strength', true, NULL),
('Arnold Press', 'Shoulders', ARRAY['Triceps', 'Front Delts'], 'Dumbbells', 'strength', true, NULL),
('Upright Row', 'Traps', ARRAY['Side Delts'], 'Barbell', 'strength', true, NULL),
('Barbell Shrug', 'Traps', ARRAY['Upper Back'], 'Barbell', 'strength', true, NULL),
('Dumbbell Shrug', 'Traps', ARRAY['Upper Back'], 'Dumbbells', 'strength', true, NULL),

-- =========================================
-- ARMS - BICEPS
-- =========================================
('Barbell Curl', 'Biceps', ARRAY['Forearms'], 'Barbell', 'strength', true, NULL),
('Dumbbell Curl', 'Biceps', ARRAY['Forearms'], 'Dumbbells', 'strength', true, NULL),
('Hammer Curl', 'Biceps', ARRAY['Brachialis', 'Forearms'], 'Dumbbells', 'strength', true, NULL),
('Incline Dumbbell Curl', 'Biceps', ARRAY['Forearms'], 'Dumbbells', 'strength', true, NULL),
('Cable Curl', 'Biceps', ARRAY['Forearms'], 'Cable Machine', 'strength', true, NULL),
('Preacher Curl', 'Biceps', ARRAY['Forearms'], 'EZ Bar', 'strength', true, NULL),
('Concentration Curl', 'Biceps', ARRAY['Forearms'], 'Dumbbell', 'strength', true, NULL),

-- =========================================
-- ARMS - TRICEPS
-- =========================================
('Tricep Pushdown', 'Triceps', ARRAY[]::text[], 'Cable Machine', 'strength', true, NULL),
('Overhead Tricep Extension', 'Triceps', ARRAY[]::text[], 'Cable Machine', 'strength', true, NULL),
('Skull Crusher', 'Triceps', ARRAY[]::text[], 'EZ Bar', 'strength', true, NULL),
('Close-Grip Bench Press', 'Triceps', ARRAY['Chest', 'Front Delts'], 'Barbell', 'strength', true, NULL),
('Dumbbell Kickback', 'Triceps', ARRAY[]::text[], 'Dumbbell', 'strength', true, NULL),
('Dip', 'Triceps', ARRAY['Chest', 'Front Delts'], 'Dip Station', 'strength', true, NULL),

-- =========================================
-- LEGS - QUADRICEPS
-- =========================================
('Leg Press', 'Quadriceps', ARRAY['Glutes', 'Hamstrings'], 'Leg Press Machine', 'strength', true, NULL),
('Hack Squat', 'Quadriceps', ARRAY['Glutes'], 'Hack Squat Machine', 'strength', true, NULL),
('Leg Extension', 'Quadriceps', ARRAY[]::text[], 'Machine', 'strength', true, NULL),
('Walking Lunges', 'Quadriceps', ARRAY['Glutes', 'Hamstrings'], 'Dumbbells', 'strength', true, NULL),
('Step-Up', 'Quadriceps', ARRAY['Glutes', 'Hamstrings'], 'Bench', 'strength', true, NULL),

-- =========================================
-- LEGS - HAMSTRINGS / GLUTES
-- =========================================
('Lying Leg Curl', 'Hamstrings', ARRAY[]::text[], 'Machine', 'strength', true, NULL),
('Seated Leg Curl', 'Hamstrings', ARRAY[]::text[], 'Machine', 'strength', true, NULL),
('Glute Bridge', 'Glutes', ARRAY['Hamstrings', 'Core'], 'Bodyweight', 'strength', true, NULL),
('Cable Pull-Through', 'Glutes', ARRAY['Hamstrings', 'Lower Back'], 'Cable Machine', 'strength', true, NULL),
('Good Morning', 'Hamstrings', ARRAY['Glutes', 'Lower Back'], 'Barbell', 'strength', true, NULL),
('Nordic Hamstring Curl', 'Hamstrings', ARRAY[]::text[], 'Bodyweight', 'strength', true, NULL),

-- =========================================
-- LEGS - CALVES
-- =========================================
('Standing Calf Raise', 'Calves', ARRAY[]::text[], 'Machine', 'strength', true, NULL),
('Seated Calf Raise', 'Calves', ARRAY[]::text[], 'Machine', 'strength', true, NULL),

-- =========================================
-- CORE
-- =========================================
('Plank', 'Core', ARRAY['Shoulders'], 'Bodyweight', 'strength', true, NULL),
('Ab Wheel Rollout', 'Core', ARRAY['Lats', 'Shoulders'], 'Ab Wheel', 'strength', true, NULL),
('Hanging Leg Raise', 'Core', ARRAY['Hip Flexors'], 'Pull-Up Bar', 'strength', true, NULL),
('Cable Crunch', 'Core', ARRAY[]::text[], 'Cable Machine', 'strength', true, NULL),
('Pallof Press', 'Core', ARRAY['Obliques'], 'Cable Machine', 'strength', true, NULL),
('Russian Twist', 'Obliques', ARRAY['Core'], 'Dumbbell', 'strength', true, NULL),
('Dead Bug', 'Core', ARRAY['Hip Flexors'], 'Bodyweight', 'strength', true, NULL),
('Bird Dog', 'Core', ARRAY['Lower Back', 'Glutes'], 'Bodyweight', 'strength', true, NULL),

-- =========================================
-- BODYWEIGHT
-- =========================================
('Push-Up', 'Chest', ARRAY['Triceps', 'Front Delts', 'Core'], 'Bodyweight', 'strength', true, NULL),
('Bodyweight Squat', 'Quadriceps', ARRAY['Glutes', 'Hamstrings'], 'Bodyweight', 'strength', true, NULL),
('Inverted Row', 'Upper Back', ARRAY['Biceps', 'Rear Delts'], 'Barbell', 'strength', true, NULL),
('Pike Push-Up', 'Shoulders', ARRAY['Triceps', 'Upper Chest'], 'Bodyweight', 'strength', true, NULL),

-- =========================================
-- MACHINE EXERCISES
-- =========================================
('Smith Machine Squat', 'Quadriceps', ARRAY['Glutes', 'Hamstrings'], 'Smith Machine', 'strength', true, NULL),
('Machine Chest Press', 'Chest', ARRAY['Triceps', 'Front Delts'], 'Machine', 'strength', true, NULL),
('Machine Shoulder Press', 'Shoulders', ARRAY['Triceps'], 'Machine', 'strength', true, NULL),
('Machine Row', 'Upper Back', ARRAY['Lats', 'Biceps'], 'Machine', 'strength', true, NULL),
('Hip Adductor Machine', 'Adductors', ARRAY[]::text[], 'Machine', 'strength', true, NULL),
('Hip Abductor Machine', 'Abductors', ARRAY['Glutes'], 'Machine', 'strength', true, NULL),

-- =========================================
-- CARDIO
-- =========================================
('Treadmill Running', 'Cardiovascular', ARRAY['Quadriceps', 'Hamstrings', 'Calves'], 'Treadmill', 'cardio', true, NULL),
('Treadmill Walking (Incline)', 'Cardiovascular', ARRAY['Glutes', 'Hamstrings', 'Calves'], 'Treadmill', 'cardio', true, NULL),
('Stationary Bike', 'Cardiovascular', ARRAY['Quadriceps', 'Hamstrings'], 'Stationary Bike', 'cardio', true, NULL),
('Rowing Machine', 'Cardiovascular', ARRAY['Upper Back', 'Lats', 'Hamstrings', 'Core'], 'Rowing Machine', 'cardio', true, NULL),
('Elliptical Trainer', 'Cardiovascular', ARRAY['Quadriceps', 'Glutes'], 'Elliptical', 'cardio', true, NULL),
('Stair Climber', 'Cardiovascular', ARRAY['Quadriceps', 'Glutes', 'Calves'], 'Stair Climber', 'cardio', true, NULL),
('Jump Rope', 'Cardiovascular', ARRAY['Calves', 'Shoulders', 'Core'], 'Jump Rope', 'cardio', true, NULL),
('Battle Ropes', 'Cardiovascular', ARRAY['Shoulders', 'Core', 'Arms'], 'Battle Ropes', 'cardio', true, NULL),
('Assault Bike', 'Cardiovascular', ARRAY['Quadriceps', 'Hamstrings', 'Shoulders'], 'Assault Bike', 'cardio', true, NULL),

-- =========================================
-- MOBILITY / STRETCHING
-- =========================================
('Foam Roll - Quadriceps', 'Quadriceps', ARRAY[]::text[], 'Foam Roller', 'mobility', true, NULL),
('Foam Roll - IT Band', 'IT Band', ARRAY[]::text[], 'Foam Roller', 'mobility', true, NULL),
('Foam Roll - Upper Back', 'Upper Back', ARRAY[]::text[], 'Foam Roller', 'mobility', true, NULL),
('Hip 90/90 Stretch', 'Hip Flexors', ARRAY['Glutes', 'Adductors'], 'Bodyweight', 'mobility', true, NULL),
('World''s Greatest Stretch', 'Hip Flexors', ARRAY['Hamstrings', 'Upper Back', 'Shoulders'], 'Bodyweight', 'mobility', true, NULL),
('Cat-Cow', 'Spine', ARRAY['Core', 'Lower Back'], 'Bodyweight', 'mobility', true, NULL),
('Thoracic Spine Rotation', 'Upper Back', ARRAY['Core', 'Obliques'], 'Bodyweight', 'mobility', true, NULL),
('Banded Shoulder Dislocate', 'Shoulders', ARRAY['Upper Back', 'Rotator Cuff'], 'Resistance Band', 'mobility', true, NULL),
('Pigeon Stretch', 'Glutes', ARRAY['Hip Flexors'], 'Bodyweight', 'mobility', true, NULL),
('Couch Stretch', 'Hip Flexors', ARRAY['Quadriceps'], 'Bodyweight', 'mobility', true, NULL),

-- =========================================
-- WARMUP
-- =========================================
('Band Pull-Apart', 'Rear Delts', ARRAY['Upper Back', 'Rotator Cuff'], 'Resistance Band', 'warmup', true, NULL),
('Banded External Rotation', 'Rotator Cuff', ARRAY['Rear Delts'], 'Resistance Band', 'warmup', true, NULL),
('Glute Activation Walk', 'Glutes', ARRAY['Abductors'], 'Resistance Band', 'warmup', true, NULL),
('Leg Swing (Front-to-Back)', 'Hip Flexors', ARRAY['Hamstrings', 'Glutes'], 'Bodyweight', 'warmup', true, NULL),
('Arm Circle', 'Shoulders', ARRAY['Rotator Cuff'], 'Bodyweight', 'warmup', true, NULL),
('Inchworm', 'Hamstrings', ARRAY['Core', 'Shoulders'], 'Bodyweight', 'warmup', true, NULL)

ON CONFLICT DO NOTHING;
