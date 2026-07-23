-- Phase 3: complete the six fundamental movement groups + isolation/affinity axis.
-- Adds Pull (H/V), Core, Carry(Full-Body); moves Kickback→legs-isolation and
-- Spinal Extension→Core; classifies every remaining strength pattern as isolation w/ PPL affinity.

-- 1) movement_groups: new top groups + sub-groups (upsert so sort_order is declarative)
INSERT INTO public.movement_groups (id, label, sort_order, is_active, parent_id) VALUES
  ('squat','Squat',1,true,NULL),
  ('hinge','Hinge',2,true,NULL),
  ('press','Press',3,true,NULL),
  ('pull','Pull',4,true,NULL),
  ('core','Core',5,true,NULL),
  ('carry','Carry / Full-Body',6,true,NULL),
  ('press_horizontal','Horizontal Press',1,true,'press'),
  ('press_anterior','Anterior Press',2,true,'press'),
  ('pull_horizontal','Horizontal Pull',1,true,'pull'),
  ('pull_vertical','Vertical Pull',2,true,'pull'),
  ('carry_loaded','Loaded Carry',1,true,'carry'),
  ('carry_complex','Complex',2,true,'carry')
ON CONFLICT (id) DO UPDATE
  SET label=EXCLUDED.label, sort_order=EXCLUDED.sort_order,
      is_active=EXCLUDED.is_active, parent_id=EXCLUDED.parent_id;

-- 2) movement_pattern_groups: add the isolation + affinity axis + explicit leaf; allow NULL group
ALTER TABLE public.movement_pattern_groups
  ALTER COLUMN movement_group_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS is_isolation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS affinity text,
  ADD COLUMN IF NOT EXISTS movement_leaf_id text REFERENCES public.movement_groups(id);

ALTER TABLE public.movement_pattern_groups
  ADD CONSTRAINT movement_pattern_groups_affinity_chk
  CHECK (affinity IS NULL OR affinity IN ('push','pull','legs','core','full_body','neck'));

-- 3) full pattern classification (compound + isolation)
INSERT INTO public.movement_pattern_groups
  (movement_pattern, movement_group_id, movement_leaf_id, is_isolation, affinity) VALUES
  -- Squat (compound, legs)
  ('Squat','squat',NULL,false,'legs'),
  ('Squat/Press','squat',NULL,false,'legs'),
  ('Sissy Squat','squat',NULL,false,'legs'),
  -- Hinge (compound, legs)
  ('Hip Hinge','hinge',NULL,false,'legs'),
  ('Deadlift','hinge',NULL,false,'legs'),
  ('Thrust','hinge',NULL,false,'legs'),
  ('Bridge','hinge',NULL,false,'legs'),
  -- Push/Press (compound, push) — leaf computed from positioning in the view
  ('Press','press',NULL,false,'push'),
  ('Pressaround','press',NULL,false,'push'),
  ('Bench Press','press',NULL,false,'push'),
  -- Pull (compound, pull)
  ('Row','pull','pull_horizontal',false,'pull'),
  ('Retraction Row','pull','pull_horizontal',false,'pull'),
  ('Pulldown','pull','pull_vertical',false,'pull'),
  -- Core (compound, core)
  ('Spinal Flexion','core',NULL,false,'core'),
  ('Crunch','core',NULL,false,'core'),
  ('Anti-Extension','core',NULL,false,'core'),
  ('Anti-Rotation','core',NULL,false,'core'),
  ('Rotation','core',NULL,false,'core'),
  ('Lateral Flexion','core',NULL,false,'core'),
  ('Spinal Extension','core',NULL,false,'core'),
  -- Carry / Full-Body (compound, full_body)
  ('Carry','carry','carry_loaded',false,'full_body'),
  ('Complex','carry','carry_complex',false,'full_body'),
  -- Isolation — push affinity
  ('Fly',NULL,NULL,true,'push'),
  ('Raise',NULL,NULL,true,'push'),
  ('Extension',NULL,NULL,true,'push'),
  ('Internal Rotation',NULL,NULL,true,'push'),
  ('Pressdown',NULL,NULL,true,'push'),
  ('Scaption',NULL,NULL,true,'push'),
  ('Protraction',NULL,NULL,true,'push'),
  ('Y-Raise',NULL,NULL,true,'push'),
  -- Isolation — pull affinity
  ('Curl',NULL,NULL,true,'pull'),
  ('Supination Curl',NULL,NULL,true,'pull'),
  ('Pronation Curl',NULL,NULL,true,'pull'),
  ('Neutral Curl',NULL,NULL,true,'pull'),
  ('Reverse Fly',NULL,NULL,true,'pull'),
  ('Shrug',NULL,NULL,true,'pull'),
  ('External Rotation',NULL,NULL,true,'pull'),
  ('Pull-Around',NULL,NULL,true,'pull'),
  ('Pullover',NULL,NULL,true,'pull'),
  ('Straight-Arm Pullover',NULL,NULL,true,'pull'),
  ('Pull-Apart',NULL,NULL,true,'pull'),
  ('Wrist Curl',NULL,NULL,true,'pull'),
  ('Wrist Extension',NULL,NULL,true,'pull'),
  ('Pronation',NULL,NULL,true,'pull'),
  ('Supination',NULL,NULL,true,'pull'),
  -- Isolation — legs affinity
  ('Kickback',NULL,NULL,true,'legs'),
  ('Knee Extension',NULL,NULL,true,'legs'),
  ('Leg Curl',NULL,NULL,true,'legs'),
  ('Calf Raise',NULL,NULL,true,'legs'),
  ('Abduction',NULL,NULL,true,'legs'),
  ('Adduction',NULL,NULL,true,'legs'),
  ('Hip Flexion',NULL,NULL,true,'legs'),
  ('Dorsiflexion',NULL,NULL,true,'legs'),
  -- Isolation — neck (outside PPL)
  ('Flexion/Extension',NULL,NULL,true,'neck')
ON CONFLICT (movement_pattern) DO UPDATE
  SET movement_group_id=EXCLUDED.movement_group_id,
      movement_leaf_id=EXCLUDED.movement_leaf_id,
      is_isolation=EXCLUDED.is_isolation,
      affinity=EXCLUDED.affinity;

-- 4) rewrite the map view: leaf (press computed, pull/carry explicit) + isolation + affinity
CREATE OR REPLACE VIEW public.exercise_movement_map WITH (security_invoker = true) AS
SELECT
  el.id AS exercise_id,
  mpg.movement_group_id AS movement_group_id,
  CASE
    WHEN mpg.movement_group_id = 'press'
      THEN CASE WHEN el.muscle_group = 'deltoids'
                  OR el.positioning IN ('Incline','Low Incline','Overhead')
                THEN 'press_anterior' ELSE 'press_horizontal' END
    WHEN mpg.movement_leaf_id IS NOT NULL THEN mpg.movement_leaf_id
    ELSE mpg.movement_group_id
  END AS movement_leaf_id,
  mpg.is_isolation AS is_isolation,
  mpg.affinity AS affinity
FROM public.exercise_library el
JOIN public.movement_pattern_groups mpg ON mpg.movement_pattern = el.movement_pattern
WHERE el.is_active;

REVOKE SELECT ON public.exercise_movement_map FROM anon, PUBLIC;
GRANT SELECT ON public.exercise_movement_map TO authenticated, service_role;
