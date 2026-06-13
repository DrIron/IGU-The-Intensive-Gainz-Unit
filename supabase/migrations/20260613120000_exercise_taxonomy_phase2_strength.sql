-- Exercise Library Redesign — Phase 2: strength taxonomy lookup tables + backfill.
-- See docs/EXERCISE_LIBRARY_REDESIGN.md (LOCKED 2026-06-13).
--
-- Creates the controlled body_region → muscle → subdivision hierarchy, seeds the
-- locked tree, adds FK columns to exercise_library, and backfills every existing
-- strength row from the free-text muscle_group/subdivision values. Old text
-- columns are KEPT during transition (dropped in Phase 6 after the frontend moves).
-- Non-destructive: no drops, no data loss.
--
-- Verification (must return 0): strength rows left without a muscle_id after backfill.

-- ──────────────────────────────────────────────────────────────
-- 1. Lookup tables
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.body_regions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text UNIQUE NOT NULL,
  display_name text NOT NULL,
  sort_order   int  NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.muscles (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text UNIQUE NOT NULL,
  display_name      text NOT NULL,
  primary_region_id uuid NOT NULL REFERENCES public.body_regions(id),
  sort_order        int  NOT NULL DEFAULT 0,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.muscle_subdivisions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text UNIQUE NOT NULL,
  display_name text NOT NULL,
  muscle_id    uuid NOT NULL REFERENCES public.muscles(id),
  sort_order   int  NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Cross-list: a subdivision that should ALSO appear under a region other than its
-- muscle's home region (e.g. Posterior Deltoid surfacing under Back).
CREATE TABLE IF NOT EXISTS public.subdivision_region_xref (
  subdivision_id uuid NOT NULL REFERENCES public.muscle_subdivisions(id) ON DELETE CASCADE,
  region_id      uuid NOT NULL REFERENCES public.body_regions(id) ON DELETE CASCADE,
  PRIMARY KEY (subdivision_id, region_id)
);

CREATE INDEX IF NOT EXISTS idx_muscles_region        ON public.muscles(primary_region_id);
CREATE INDEX IF NOT EXISTS idx_subdivisions_muscle   ON public.muscle_subdivisions(muscle_id);

-- ──────────────────────────────────────────────────────────────
-- 2. Seed — regions
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.body_regions (slug, display_name, sort_order) VALUES
  ('chest','Chest',1),('back','Back',2),('shoulders','Shoulders',3),
  ('arms','Arms',4),('legs','Legs',5),('core','Core',6),('neck','Neck',7)
ON CONFLICT (slug) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 3. Seed — muscles
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.muscles (slug, display_name, primary_region_id, sort_order)
SELECT m.slug, m.display_name, r.id, m.sort_order
FROM (VALUES
  ('pec_major','Pec Major','chest',1),
  ('pec_minor','Pec Minor','chest',2),
  ('serratus_anterior','Serratus Anterior','chest',3),
  ('lats','Lats','back',1),
  ('upper_back','Upper Back','back',2),
  ('mid_back','Mid Back','back',3),
  ('lower_back','Lower Back','back',4),
  ('deltoids','Deltoids','shoulders',1),
  ('rotator_cuff','Rotator Cuff','shoulders',2),
  ('elbow_flexors','Biceps / Elbow Flexors','arms',1),
  ('triceps','Triceps','arms',2),
  ('forearm','Forearm','arms',3),
  ('quads','Quads','legs',1),
  ('hamstrings','Hamstrings','legs',2),
  ('glutes','Glutes','legs',3),
  ('adductors','Adductors','legs',4),
  ('abductors','Abductors','legs',5),
  ('hip_flexors','Hip Flexors','legs',6),
  ('calves','Calves','legs',7),
  ('tibialis_anterior','Tibialis Anterior','legs',8),
  ('rectus_abdominis','Rectus Abdominis','core',1),
  ('obliques','Obliques','core',2),
  ('pelvic_muscles','Pelvic Muscles','core',3),
  ('neck','Neck','neck',1)
) AS m(slug, display_name, region_slug, sort_order)
JOIN public.body_regions r ON r.slug = m.region_slug
ON CONFLICT (slug) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 4. Seed — subdivisions
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.muscle_subdivisions (slug, display_name, muscle_id, sort_order)
SELECT s.slug, s.display_name, mu.id, s.sort_order
FROM (VALUES
  ('pec_major_clavicular','Clavicular Head','pec_major',1),
  ('pec_major_sternal','Sternal Head','pec_major',2),
  ('pec_major_costal','Costal Head','pec_major',3),
  ('lats_thoracic','Thoracic','lats',1),
  ('lats_lumbar','Lumbar','lats',2),
  ('lats_iliac','Iliac','lats',3),
  ('upper_traps','Upper Trapezius','upper_back',1),
  ('teres_major','Teres Major','upper_back',2),
  ('rhomboids','Rhomboids','mid_back',1),
  ('mid_traps','Mid Trapezius','mid_back',2),
  ('lower_traps','Lower Trapezius','mid_back',3),
  ('spinal_erectors','Spinal Erectors','lower_back',1),
  ('deltoid_anterior','Anterior','deltoids',1),
  ('deltoid_lateral','Lateral','deltoids',2),
  ('deltoid_posterior','Posterior','deltoids',3),
  ('supraspinatus','Supraspinatus','rotator_cuff',1),
  ('infraspinatus','Infraspinatus','rotator_cuff',2),
  ('subscapularis','Subscapularis','rotator_cuff',3),
  ('teres_minor','Teres Minor','rotator_cuff',4),
  ('biceps_long','Biceps Long Head','elbow_flexors',1),
  ('biceps_short','Biceps Short Head','elbow_flexors',2),
  ('brachialis','Brachialis','elbow_flexors',3),
  ('brachioradialis','Brachioradialis','elbow_flexors',4),
  ('triceps_long','Long Head','triceps',1),
  ('triceps_lateral_medial','Lateral & Medial Head','triceps',2),
  ('forearm_flexors','Flexors','forearm',1),
  ('forearm_extensors','Extensors','forearm',2),
  ('forearm_pronators','Pronators','forearm',3),
  ('forearm_supinators','Supinators','forearm',4),
  ('rectus_femoris','Rectus Femoris','quads',1),
  ('vastii','Vastii','quads',2),
  ('glute_max','Gluteus Maximus','glutes',1),
  ('glute_med','Gluteus Medius','glutes',2),
  ('glute_min','Gluteus Minimus','glutes',3),
  ('gastrocnemius','Gastrocnemius','calves',1),
  ('soleus','Soleus','calves',2)
) AS s(slug, display_name, muscle_slug, sort_order)
JOIN public.muscles mu ON mu.slug = s.muscle_slug
ON CONFLICT (slug) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 5. Cross-list — Posterior Deltoid also under Back
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.subdivision_region_xref (subdivision_id, region_id)
SELECT sd.id, r.id
FROM public.muscle_subdivisions sd, public.body_regions r
WHERE sd.slug = 'deltoid_posterior' AND r.slug = 'back'
ON CONFLICT DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 6. exercise_library — add FK columns
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS muscle_id      uuid REFERENCES public.muscles(id),
  ADD COLUMN IF NOT EXISTS subdivision_id uuid REFERENCES public.muscle_subdivisions(id);

CREATE INDEX IF NOT EXISTS idx_exercise_library_muscle      ON public.exercise_library(muscle_id);
CREATE INDEX IF NOT EXISTS idx_exercise_library_subdivision ON public.exercise_library(subdivision_id);

-- ──────────────────────────────────────────────────────────────
-- 7. Backfill — subdivision_id from legacy subdivision text
--    (only values that remain subdivisions in the new tree)
-- ──────────────────────────────────────────────────────────────

UPDATE public.exercise_library el
SET subdivision_id = ms.id
FROM (VALUES
  ('pecs_clavicular','pec_major_clavicular'),
  ('pecs_sternal','pec_major_sternal'),
  ('pecs_costal','pec_major_costal'),
  ('lats_thoracic','lats_thoracic'),
  ('lats_lumbar','lats_lumbar'),
  ('lats_iliac','lats_iliac'),
  ('upper_back_upper_traps','upper_traps'),
  ('upper_back_teres_major','teres_major'),
  ('mid_back_rhomboids','rhomboids'),
  ('mid_back_mid_traps','mid_traps'),
  ('mid_back_low_traps','lower_traps'),
  ('shoulders_anterior','deltoid_anterior'),
  ('shoulders_lateral','deltoid_lateral'),
  ('shoulders_posterior','deltoid_posterior'),
  ('rotator_cuff_supraspinatus','supraspinatus'),
  ('rotator_cuff_infraspinatus','infraspinatus'),
  ('rotator_cuff_subscapularis','subscapularis'),
  ('elbow_flexors_biceps_long','biceps_long'),
  ('elbow_flexors_biceps_short','biceps_short'),
  ('elbow_flexors_brachialis','brachialis'),
  ('elbow_flexors_brachioradialis','brachioradialis'),
  ('triceps_long','triceps_long'),
  ('triceps_lateral','triceps_lateral_medial'),
  ('forearm_flexors','forearm_flexors'),
  ('forearm_extensors','forearm_extensors'),
  ('forearm_pronators','forearm_pronators'),
  ('forearm_supinators','forearm_supinators'),
  ('quads_rectus_femoris','rectus_femoris'),
  ('glutes_max','glute_max'),
  ('glutes_med','glute_med'),
  ('calves_gastrocnemius','gastrocnemius'),
  ('calves_soleus','soleus'),
  ('core_erectors','spinal_erectors')
) AS sub_map(old_sub, new_sub)
JOIN public.muscle_subdivisions ms ON ms.slug = sub_map.new_sub
WHERE el.subdivision = sub_map.old_sub;

-- ──────────────────────────────────────────────────────────────
-- 8. Obliques — reassign the oblique-dominant "Abs" exercises
--    (active rotation, anti-rotation, lateral flexion) out of rectus abdominis.
--    These keep subdivision_id NULL; muscle_id set to obliques in step 9d.
-- ──────────────────────────────────────────────────────────────
-- (Handled in step 9 by name match — listed here for visibility.)

-- ──────────────────────────────────────────────────────────────
-- 9. Backfill — muscle_id
-- ──────────────────────────────────────────────────────────────

-- 9a. From the subdivision just assigned.
UPDATE public.exercise_library el
SET muscle_id = ms.muscle_id
FROM public.muscle_subdivisions ms
WHERE el.subdivision_id = ms.id AND el.muscle_id IS NULL;

-- 9b. Legacy subdivisions that became muscle-level (no subdivision): serratus, tibialis.
UPDATE public.exercise_library el
SET muscle_id = mu.id
FROM (VALUES
  ('serratus_anterior','serratus_anterior'),
  ('tibialis_anterior','tibialis_anterior')
) AS mm(old_sub, new_muscle)
JOIN public.muscles mu ON mu.slug = mm.new_muscle
WHERE el.muscle_id IS NULL AND el.subdivision = mm.old_sub;

-- 9c. Rectus abdominis (true ab work — crunches, leg raises, planks).
UPDATE public.exercise_library el
SET muscle_id = (SELECT id FROM public.muscles WHERE slug = 'rectus_abdominis')
WHERE el.muscle_id IS NULL AND el.subdivision = 'core_rectus_abdominis';

-- 9d. Obliques override (rotation / anti-rotation / lateral flexion).
UPDATE public.exercise_library el
SET muscle_id = (SELECT id FROM public.muscles WHERE slug = 'obliques'),
    subdivision_id = NULL
WHERE el.name IN (
  'Abs BB Landmine Rotation (M)',
  'Abs C-AA Woodchop (M)',
  'Abs C-FT High-to-Low Woodchop (M)',
  'Abs C-FT Low-to-High Woodchop (M)',
  'Abs DB Russian Twist (M)',
  'Abs C-AA Pallof Press (S)',
  'Abs C-FT Pallof Press (S)',
  'Abs C-FT Side Bend (S)',
  'Abs DB Side Bend (S)'
);

-- 9e. Rows with no legacy subdivision: map by legacy muscle_group.
UPDATE public.exercise_library el
SET muscle_id = mu.id
FROM (VALUES
  ('abductors','abductors'),
  ('adductors','adductors'),
  ('elbow_flexors','elbow_flexors'),
  ('hamstrings','hamstrings'),
  ('hip_flexors','hip_flexors'),
  ('quads','quads'),
  ('neck','neck')
) AS mg(old_mg, new_muscle)
JOIN public.muscles mu ON mu.slug = mg.new_muscle
WHERE el.muscle_id IS NULL AND el.category = 'strength' AND el.muscle_group = mg.old_mg;

-- ──────────────────────────────────────────────────────────────
-- 10. RLS — authenticated read, admin write
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.body_regions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muscles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.muscle_subdivisions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subdivision_region_xref ENABLE ROW LEVEL SECURITY;

-- body_regions
DROP POLICY IF EXISTS "body_regions_auth_read" ON public.body_regions;
CREATE POLICY "body_regions_auth_read" ON public.body_regions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "body_regions_admin_all" ON public.body_regions;
CREATE POLICY "body_regions_admin_all" ON public.body_regions
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.body_regions TO authenticated;

-- muscles
DROP POLICY IF EXISTS "muscles_auth_read" ON public.muscles;
CREATE POLICY "muscles_auth_read" ON public.muscles
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "muscles_admin_all" ON public.muscles;
CREATE POLICY "muscles_admin_all" ON public.muscles
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.muscles TO authenticated;

-- muscle_subdivisions
DROP POLICY IF EXISTS "muscle_subdivisions_auth_read" ON public.muscle_subdivisions;
CREATE POLICY "muscle_subdivisions_auth_read" ON public.muscle_subdivisions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "muscle_subdivisions_admin_all" ON public.muscle_subdivisions;
CREATE POLICY "muscle_subdivisions_admin_all" ON public.muscle_subdivisions
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.muscle_subdivisions TO authenticated;

-- subdivision_region_xref
DROP POLICY IF EXISTS "subdivision_region_xref_auth_read" ON public.subdivision_region_xref;
CREATE POLICY "subdivision_region_xref_auth_read" ON public.subdivision_region_xref
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "subdivision_region_xref_admin_all" ON public.subdivision_region_xref;
CREATE POLICY "subdivision_region_xref_admin_all" ON public.subdivision_region_xref
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subdivision_region_xref TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 11. Verify (run after apply — expect 0)
-- ──────────────────────────────────────────────────────────────
-- SELECT COUNT(*) FROM exercise_library
-- WHERE category = 'strength' AND is_active AND muscle_id IS NULL;
