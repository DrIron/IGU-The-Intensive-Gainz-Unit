-- client_movement = equipment+movement descriptor WITHOUT any muscle label (title/focus now derive from taxonomy FKs).
ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS client_movement text;

COMMENT ON COLUMN public.exercise_library.client_movement IS 'Client-facing movement descriptor (equipment expanded, no muscle label, no size marker). Client title composes as client_muscle + client_movement via exercise_client_display.';

-- 2a. Rows with an existing client_name: strip the leading friendly muscle label (validated live: 564 rows match, 0 mismatches).
UPDATE public.exercise_library el
SET client_movement = substr(el.client_name, length(x.label) + 2)
FROM (
  SELECT el2.id, lm.label
  FROM public.exercise_library el2
  JOIN public.muscles m ON m.id = el2.muscle_id
  LEFT JOIN public.muscle_subdivisions ms ON ms.id = el2.subdivision_id
  JOIN (VALUES
    ('Abductors',NULL::text,'Abductors'),('Abs','Obliques','Obliques'),('Abs','Rectus Abdominis','Abs'),
    ('Adductors',NULL,'Adductors'),('Calves','Gastrocnemius','Gastrocnemius'),('Calves','Soleus','Soleus'),
    ('Core','TVA','Core'),('Deltoids','Anterior','Front Delts'),('Deltoids','Lateral','Lateral Delts'),
    ('Deltoids','Posterior','Posterior Delts'),('Elbow Flexors','Biceps','Biceps'),
    ('Elbow Flexors','Biceps Long Head','Long Head Biceps'),('Elbow Flexors','Biceps Short Head','Short Head Biceps'),
    ('Elbow Flexors','Brachialis','Brachialis'),('Elbow Flexors','Brachioradialis','Brachioradialis'),
    ('Forearm','Extensors','Extensors'),('Forearm','Flexors','Flexors'),('Forearm','Pronators','Pronators'),
    ('Forearm','Supinators','Supinators'),('Glutes','Gluteus Maximus','Glute Max'),
    ('Glutes','Gluteus Medius','Glute Med'),('Glutes','Gluteus Minimus','Glute Min'),
    ('Hamstrings',NULL,'Hamstrings'),('Hip Flexors',NULL,'Hip Flexors'),
    ('Lats','Iliac','Lower Lats'),('Lats','Lumbar','Mid Lats'),('Lats','Thoracic','Upper Lats'),
    ('Lower Back','Spinal Erectors','Lower Back'),('Mid Back','Lower Trapezius','Lower Traps'),
    ('Mid Back','Mid Trapezius','Mid Back'),('Mid Back','Rhomboids','Mid Back'),
    ('Neck',NULL,'Neck'),('Pec Major','Clavicular Head','Upper Pec'),('Pec Major','Costal Head','Lower Pec'),
    ('Pec Major','Sternal Head','Mid Pec'),('Quads','Rectus Femoris','Rectus Femoris'),('Quads',NULL,'Quads'),
    ('Rotator Cuff','Infraspinatus','Infraspinatus'),('Rotator Cuff','Subscapularis','Subscapularis'),
    ('Rotator Cuff','Supraspinatus','Supraspinatus'),('Serratus Anterior',NULL,'Serratus'),
    ('Tibialis Anterior',NULL,'Tibialis Anterior'),('Triceps','Lateral & Medial Head','Triceps'),
    ('Triceps','Long Head','Triceps Long Head'),('Upper Back','Teres Major','Teres Major'),
    ('Upper Back','Upper Trapezius','Upper Traps'),('Upper/Mid Back','Compound','Upper/Mid Back')
  ) lm(muscle, subdivision, label)
    ON lm.muscle = m.display_name AND lm.subdivision IS NOT DISTINCT FROM ms.display_name
  WHERE el2.client_name LIKE lm.label || ' %'
) x
WHERE x.id = el.id AND el.client_movement IS NULL;

-- 2b. Systemic + Powerlifting client_names carry no muscle label: pass through unchanged.
UPDATE public.exercise_library el
SET client_movement = el.client_name
FROM public.muscles m
WHERE m.id = el.muscle_id AND m.display_name IN ('Systemic','Powerlifting')
  AND el.client_name IS NOT NULL AND btrim(el.client_name) <> ''
  AND el.client_movement IS NULL;

-- 2c. The 40 retired rows referenced by active client plans (blank client_name): hand-generated movement descriptors.
UPDATE public.exercise_library el
SET client_movement = v.cm
FROM (VALUES
  ('21d9dffb-f288-4b78-acb4-28c1c1f76372'::uuid,'Seated Machine Adduction'),
  ('d596a4b7-97a8-4e3d-b3aa-c6dc0b7a9335','Machine Leg Press Calf Raise'),
  ('c529e872-cb7d-4b36-b3e4-ce08bae62960','Seated Overhead Barbell Press'),
  ('437f6fdb-dce4-4464-b9f1-2ba1555f9fea','Standing Overhead Barbell Press'),
  ('e6930d15-8278-471d-ae05-e0689d80a343','Seated Overhead Dumbbell Press'),
  ('e3deda06-9256-4da1-9937-0592a13c1cb9','Cable Lateral Raise'),
  ('611dbbbf-619f-4c89-8a12-de04ec680db1','Standing Dumbbell Lateral Raise'),
  ('61346344-64a5-4a8b-a84d-ef1bee415498','Machine Lateral Raise'),
  ('6cf2dec8-becd-436f-850f-c8d98919e06c','Cable Reverse Fly'),
  ('a724a031-f16f-45e5-bee7-343376e5e28e','Behind-Body Cable Curl'),
  ('24be2401-0709-41ae-b795-10190de209ab','Cable Rope Hammer Curl'),
  ('e4b05687-b2d2-48c7-b2af-38c0421db808','Trap Bar Deadlift'),
  ('1f90a5e8-c758-4da3-ac6d-94ec5d15c655','Seated Machine Hip Abduction'),
  ('5f32ae8b-63ab-4b56-9f42-1d1fe81a55f3','Barbell Romanian Deadlift'),
  ('8e8194a0-2178-4e44-ac79-8523e2fe3369','Close Neutral-Grip Machine Pulldown'),
  ('17fb18ac-6701-477c-b57e-72312855eafc','Seated Narrow-Grip Cable Row'),
  ('b996ad09-689d-49f9-b473-f1655aa47332','Wide Overhand Barbell Row'),
  ('bdb7e2ee-ac78-4dd4-bb92-5f1aeb6c92f9','Cable Single-Arm Pull-Around'),
  ('aa89328c-dd8c-454a-a043-86b882f7c42a','Cable Single-Arm Pulldown'),
  ('11021aad-0fee-4c37-9335-f19907a147b8','45-Degree Bodyweight Back Extension'),
  ('6472d98b-990a-4ae6-93c1-cf8e6d2370ee','Cable Rope Face Pull'),
  ('4d46e394-35fe-4dcd-8689-6ebfeabe24c0','Chest-Supported Wide Dumbbell Row'),
  ('b612104e-f220-42a6-8544-eb0c58932c18','Chest-Supported Close-Grip Machine Row'),
  ('3e24b30c-db21-4451-b8d3-4d7200ae42fa','Barbell Landmine Rotation'),
  ('3cfbff1c-37b7-49c5-8026-6c6d0c296b6a','Cable Pallof Press'),
  ('81419f48-b882-4599-ae3b-a952d66ea3c2','Dumbbell Suitcase Carry'),
  ('c2e9040b-26c5-4426-96d4-51aa640b691e','Incline Machine Press'),
  ('5b415ec4-3afc-4bce-8d7a-6152e8700bbd','Seated Cable Fly'),
  ('01907e78-1d25-4e29-82bc-e766b59a677b','Smith Machine Flat Press'),
  ('97a45dc6-bf3a-4ba5-bc38-6e8672a8a0eb','Seated Machine Leg Extension'),
  ('b1941175-3ee0-4a0c-a3eb-ff492bebc56c','High-Bar Barbell Back Squat'),
  ('bdf90752-e57d-4cfa-a94b-0dd6ed98bdb4','Cable Step-Up'),
  ('67988daa-22ab-4199-82b1-6161af810b10','Contralateral Deficit Dumbbell Reverse Lunge'),
  ('76df68b1-5272-439c-a1d8-e2699c9bfb08','Machine Hack Squat'),
  ('b04d3a89-d031-46bd-bea6-039c1ff98583','Smith Machine Reverse Lunge'),
  ('e9db4bf8-74ee-4822-af89-76cac2bac416','Kneeling Cable Crunch'),
  ('8e502971-74c1-427d-a258-fcb2b4c8465b','Machine Crunch'),
  ('551ff3eb-d053-4667-a931-11cf114759c5','Dumbbell Overhead Carry'),
  ('ed347c1d-3e02-45dd-bffa-aacb29eefe52','Cable Dorsiflexion'),
  ('744ae55e-0c0e-4918-9553-eeb10974f15b','Machine Pressdown')
) v(id, cm)
WHERE el.id = v.id AND el.client_movement IS NULL AND el.is_active = false;
