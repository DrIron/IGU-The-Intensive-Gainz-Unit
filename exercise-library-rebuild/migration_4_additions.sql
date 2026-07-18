-- Migration 4: exercise-library additions + reverse-lunge recategorisation (Quads -> Glutes).
-- Adds 11 new exercises, reactivates 3 previously-deactivated rows (Copenhagen Plank, DB Side-Lying
-- Abduction, Triceps Long M Overhead Extension), and deactivates the 2 Quads reverse lunges that
-- moved under Glutes. FKs resolved by name. Apply via db push AFTER migration_2. REVIEW before push.
BEGIN;

-- 1) Move the two Quads reverse lunges out of the active set (reverse lunge now lives under Glutes;
--    normal lunge stays under Quads). Rows kept for historical program refs; remap (migration 3)
--    repoints their program references to the new Glute Max reverse lunges.
UPDATE exercise_library SET is_active=false
 WHERE name IN ('Quads BB Reverse Lunge (L)','Quads DB Reverse Lunge (L)') AND is_active=true;

-- 2) Upsert the 14 add/reactivate rows. New names INSERT; the 3 names that already exist inactive
--    (from the pre-576 library) hit ON CONFLICT and are reactivated + refreshed to canonical metadata.
INSERT INTO exercise_library
 (id,name,client_name,equipment,category,muscle_group,subdivision,movement_pattern,positioning,grip,laterality,resistance_profiles,muscle_id,subdivision_id,is_global,is_active)
SELECT gen_random_uuid(), v.name, v.client_name, v.equipment, 'strength'::text,
       lower(v.muscle), v.subdivision, v.movement, v.positioning, v.grip, v.laterality, v.resistance,
       m.id, sd.id, true, true
FROM (VALUES
 ('Legs','Adductors',NULL,'Adductors BW Copenhagen Plank (M)','Adductors Bodyweight Copenhagen Plank','BW','Adduction','-','-','bi',ARRAY['Mid-range']::text[]),
 ('Legs','Glutes','Gluteus Maximus','Glute Max BB Reverse Lunge (L)','Glute Max Barbell Reverse Lunge','BB','Squat/Press','-','-','bi',ARRAY['Lengthened']::text[]),
 ('Legs','Glutes','Gluteus Maximus','Glute Max DB Contralateral-Elevated Reverse Lunge (L)','Glute Max Contralateral-Elevated Dumbbell Reverse Lunge','DB','Squat/Press','Contralateral-Elevated','-','bi',ARRAY['Lengthened']::text[]),
 ('Legs','Glutes','Gluteus Maximus','Glute Max DB Front-Foot-Elevated Reverse Lunge (L)','Glute Max Front-Foot-Elevated Dumbbell Reverse Lunge','DB','Squat/Press','Front-Foot-Elevated','-','bi',ARRAY['Lengthened']::text[]),
 ('Legs','Glutes','Gluteus Maximus','Glute Max DB Reverse Lunge (L)','Glute Max Dumbbell Reverse Lunge','DB','Squat/Press','-','-','bi',ARRAY['Lengthened']::text[]),
 ('Legs','Glutes','Gluteus Maximus','Glute Max SM Reverse Lunge (L)','Glute Max Smith Machine Reverse Lunge','SM','Squat/Press','-','-','bi',ARRAY['Lengthened']::text[]),
 ('Legs','Glutes','Gluteus Medius','Glute Med DB Side-Lying Abduction (S)','Glute Med Dumbbell Side-Lying Abduction','DB','Abduction','-','-','bi',ARRAY['Shortened']::text[]),
 ('Back','Mid Back','Mid Trapezius','Mid Traps C-AA Standing Retraction Row (S)','Mid Back Standing Cable Retraction Row','C-AA','Retraction Row','Standing','Neutral/Pronated','bi',ARRAY['Shortened']::text[]),
 ('Back','Mid Back','Mid Trapezius','Mid Traps C-FT Standing Retraction Row (S)','Mid Back Standing Cable Retraction Row','C-FT','Retraction Row','Standing','Neutral/Pronated','bi',ARRAY['Shortened']::text[]),
 ('Back','Mid Back','Mid Trapezius','Mid Traps C-SG Single-Arm Retraction Row (S)','Mid Back Cable Single-Arm Retraction Row','C-SG','Retraction Row','Standing','Neutral/Pronated','uni',ARRAY['Shortened']::text[]),
 ('Legs','Quads',NULL,'Quads C-AA Step-Up (L)','Quads Cable Step-Up','C-AA','Squat','-','-','bi',ARRAY['Lengthened']::text[]),
 ('Legs','Quads',NULL,'Quads C-FT Step-Up (L)','Quads Cable Step-Up','C-FT','Squat','-','-','bi',ARRAY['Lengthened']::text[]),
 ('Legs','Quads',NULL,'Quads C-SG Single-Leg Step-Up (L)','Quads Cable Single-Leg Step-Up','C-SG','Squat','-','-','uni',ARRAY['Lengthened']::text[]),
 ('Arms','Triceps','Long Head','Triceps Long M Overhead Extension (L)','Triceps Long Head Overhead Machine Extension','M','Extension','Overhead','Neutral','bi',ARRAY['Lengthened']::text[])
) AS v(region,muscle,subdivision,name,client_name,equipment,movement,positioning,grip,laterality,resistance)
JOIN body_regions r ON r.display_name = v.region
JOIN muscles m ON m.display_name = v.muscle AND m.primary_region_id = r.id
LEFT JOIN muscle_subdivisions sd ON sd.muscle_id = m.id AND sd.display_name = v.subdivision
ON CONFLICT (name) DO UPDATE SET
  is_active=true,
  client_name=EXCLUDED.client_name,
  equipment=EXCLUDED.equipment,
  category=EXCLUDED.category,
  muscle_group=EXCLUDED.muscle_group,
  subdivision=EXCLUDED.subdivision,
  movement_pattern=EXCLUDED.movement_pattern,
  positioning=EXCLUDED.positioning,
  grip=EXCLUDED.grip,
  laterality=EXCLUDED.laterality,
  resistance_profiles=EXCLUDED.resistance_profiles,
  muscle_id=EXCLUDED.muscle_id,
  subdivision_id=EXCLUDED.subdivision_id,
  is_global=true;

COMMIT;
-- Expect: 11 inserted, 3 updated (reactivated), 2 deactivated. Net active strength +12.
