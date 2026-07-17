-- Migration 1: exercise-library taxonomy (new regions/muscles/subdivisions + Elbow Flexors rename)
-- REVIEW before db push. Uses fixed slugs; IDs via gen_random_uuid().
BEGIN;

-- new regions
INSERT INTO body_regions (id,slug,display_name,sort_order,is_active)
VALUES (gen_random_uuid(),'systemic','Systemic',8,true),
       (gen_random_uuid(),'powerlifting','Powerlifting',9,true)
ON CONFLICT (slug) DO NOTHING;

-- rename Biceps / Elbow Flexors -> Elbow Flexors, add generic Biceps subdivision
UPDATE muscles SET display_name='Elbow Flexors' WHERE display_name='Biceps / Elbow Flexors';
INSERT INTO muscle_subdivisions (id,slug,display_name,muscle_id,sort_order,is_active,volume_key)
SELECT gen_random_uuid(),'biceps_generic','Biceps',id,0,true,'biceps'
FROM muscles WHERE display_name='Elbow Flexors'
ON CONFLICT (slug) DO NOTHING;

-- Abs muscle (Core region) with Rectus Abdominis + Obliques as subdivisions
INSERT INTO muscles (id,slug,display_name,primary_region_id,sort_order,is_active,volume_key)
SELECT gen_random_uuid(),'abs','Abs',id,10,true,'abs' FROM body_regions WHERE display_name='Core'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO muscle_subdivisions (id,slug,display_name,muscle_id,sort_order,is_active,volume_key)
SELECT gen_random_uuid(),'abs_rectus','Rectus Abdominis',m.id,1,true,'rectus_abdominis' FROM muscles m WHERE m.display_name='Abs'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO muscle_subdivisions (id,slug,display_name,muscle_id,sort_order,is_active,volume_key)
SELECT gen_random_uuid(),'abs_obliques','Obliques',m.id,2,true,'obliques' FROM muscles m WHERE m.display_name='Abs'
ON CONFLICT (slug) DO NOTHING;

-- Core muscle (Core region) with TVA
INSERT INTO muscles (id,slug,display_name,primary_region_id,sort_order,is_active,volume_key)
SELECT gen_random_uuid(),'core_deep','Core',id,11,true,'core' FROM body_regions WHERE display_name='Core'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO muscle_subdivisions (id,slug,display_name,muscle_id,sort_order,is_active,volume_key)
SELECT gen_random_uuid(),'core_tva','TVA',m.id,1,true,'core' FROM muscles m WHERE m.display_name='Core' AND m.slug='core_deep'
ON CONFLICT (slug) DO NOTHING;

-- Upper/Mid Back compound muscle
INSERT INTO muscles (id,slug,display_name,primary_region_id,sort_order,is_active,volume_key)
SELECT gen_random_uuid(),'upper_mid_back','Upper/Mid Back',id,5,true,'upper_back' FROM body_regions WHERE display_name='Back'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO muscle_subdivisions (id,slug,display_name,muscle_id,sort_order,is_active,volume_key)
SELECT gen_random_uuid(),'upper_mid_compound','Compound',m.id,1,true,'upper_back' FROM muscles m WHERE m.slug='upper_mid_back'
ON CONFLICT (slug) DO NOTHING;

-- Systemic + Powerlifting muscles
INSERT INTO muscles (id,slug,display_name,primary_region_id,sort_order,is_active,volume_key)
SELECT gen_random_uuid(),'systemic','Systemic',id,1,true,NULL FROM body_regions WHERE display_name='Systemic'
ON CONFLICT (slug) DO NOTHING;
INSERT INTO muscles (id,slug,display_name,primary_region_id,sort_order,is_active,volume_key)
SELECT gen_random_uuid(),'powerlifting','Powerlifting',id,1,true,NULL FROM body_regions WHERE display_name='Powerlifting'
ON CONFLICT (slug) DO NOTHING;

COMMIT;
