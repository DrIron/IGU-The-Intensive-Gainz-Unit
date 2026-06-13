-- Exercise Library Redesign — Phase 3: non-strength facet lookups + backfill.
-- See docs/EXERCISE_LIBRARY_REDESIGN.md.
--
-- Gives cardio / mobility / warmup / cooldown / physio their own facet trees so they
-- stop living in the muscle-centric strength columns. Decision (2026-06-13): cardio
-- energy system is a PRESCRIPTION field (set in the program builder), not a per-exercise
-- property — energy_systems is seeded here for that dropdown but not assigned to rows.
-- Cardio library browses by Movement -> Equipment; equipment stays free-text for now
-- (master equipment list deferred per Hasan). Idempotent / non-destructive.
--
-- Backfills the 25 current non-strength rows (9 cardio, 10 mobility, 6 warmup).
-- cooldown / physio / sport_specific have no exercises yet — lookups seeded for later.

-- ──────────────────────────────────────────────────────────────
-- 1. Lookup tables
-- ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cardio_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL, display_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.energy_systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL, display_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.activity_techniques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL, display_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.target_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL, display_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.physio_purposes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL, display_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

-- ──────────────────────────────────────────────────────────────
-- 2. Seed
-- ──────────────────────────────────────────────────────────────

INSERT INTO public.cardio_movements (slug, display_name, sort_order) VALUES
  ('run','Run',1),('walk','Walk',2),('row','Row',3),('cycle','Cycle',4),
  ('climb','Climb',5),('skip','Skip',6),('glide','Glide',7),('ski','Ski',8),
  ('carry','Carry',9),('drag_push','Drag / Push',10),('functional','Functional / Mixed',11)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.energy_systems (slug, display_name, sort_order) VALUES
  ('liss','LISS (Z1-2)',1),('steady_state','Steady-state (Z3)',2),('tempo','Tempo (Z4)',3),
  ('intervals','Intervals (Z4-5)',4),('hiit','HIIT (Z5)',5),('sprint','Sprint / Anaerobic',6)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.activity_techniques (slug, display_name, sort_order) VALUES
  ('dynamic_stretch','Dynamic Stretch',1),('static_stretch','Static Stretch',2),
  ('pnf','PNF',3),('cars','CARs',4),('foam_roll','Foam Roll / SMR',5),
  ('banded_distraction','Banded Distraction',6),('activation','Activation',7),
  ('dynamic_warmup','Dynamic Warmup',8),('general_raise','General Raise',9),
  ('potentiation','Potentiation',10),('breathing','Breathing / Down-regulation',11),
  ('decompression','Decompression',12)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.target_regions (slug, display_name, sort_order) VALUES
  ('full_body','Full Body',1),('neck','Neck',2),('shoulders','Shoulders',3),
  ('upper_back','Upper Back',4),('t_spine','T-Spine',5),('lower_back','Lower Back',6),
  ('hips','Hips',7),('glutes','Glutes',8),('quads','Quads',9),('hamstrings','Hamstrings',10),
  ('adductors','Adductors',11),('calves','Calves',12),('ankles','Ankles',13),('wrists','Wrists',14)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.physio_purposes (slug, display_name, sort_order) VALUES
  ('mobility','Mobility',1),('stability','Stability',2),('strengthening','Strengthening',3),
  ('pain_relief','Pain Relief',4),('activation','Activation',5),('proprioception','Proprioception',6)
ON CONFLICT (slug) DO NOTHING;

-- ──────────────────────────────────────────────────────────────
-- 3. exercise_library — facet FK columns
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS cardio_movement_id uuid REFERENCES public.cardio_movements(id),
  ADD COLUMN IF NOT EXISTS technique_id       uuid REFERENCES public.activity_techniques(id),
  ADD COLUMN IF NOT EXISTS target_region_id   uuid REFERENCES public.target_regions(id),
  ADD COLUMN IF NOT EXISTS physio_purpose_id  uuid REFERENCES public.physio_purposes(id);

CREATE INDEX IF NOT EXISTS idx_el_cardio_movement ON public.exercise_library(cardio_movement_id);
CREATE INDEX IF NOT EXISTS idx_el_technique       ON public.exercise_library(technique_id);
CREATE INDEX IF NOT EXISTS idx_el_target_region   ON public.exercise_library(target_region_id);

-- ──────────────────────────────────────────────────────────────
-- 4. Backfill — cardio movement (by name)
-- ──────────────────────────────────────────────────────────────

UPDATE public.exercise_library el
SET cardio_movement_id = cm.id
FROM (VALUES
  ('Cardio Assault Bike (M)','cycle'),
  ('Cardio Battle Ropes (M)','functional'),
  ('Cardio Elliptical Trainer (M)','glide'),
  ('Cardio Jump Rope (M)','skip'),
  ('Cardio Rowing Machine (M)','row'),
  ('Cardio Stair Climber (M)','climb'),
  ('Cardio Stationary Bike (M)','cycle'),
  ('Cardio Treadmill Incline Walking (M)','walk'),
  ('Cardio Treadmill Running (M)','run')
) AS map(ex_name, mv) JOIN public.cardio_movements cm ON cm.slug = map.mv
WHERE el.name = map.ex_name;

-- ──────────────────────────────────────────────────────────────
-- 5. Backfill — mobility + warmup (technique + target region, by name)
-- ──────────────────────────────────────────────────────────────

UPDATE public.exercise_library el
SET technique_id = t.id, target_region_id = tr.id
FROM (VALUES
  -- mobility
  ('Mobility BW Banded Shoulder Dislocate (L)','dynamic_stretch','shoulders'),
  ('Mobility BW Cat-Cow (M)','dynamic_stretch','t_spine'),
  ('Mobility BW Couch Stretch (L)','static_stretch','hips'),
  ('Mobility BW Hip 90/90 Stretch (L)','static_stretch','hips'),
  ('Mobility BW Pigeon Stretch (L)','static_stretch','glutes'),
  ('Mobility BW Thoracic Spine Rotation (M)','dynamic_stretch','t_spine'),
  ('Mobility BW World''s Greatest Stretch (L)','dynamic_stretch','hips'),
  ('Mobility Foam Roll IT Band (M)','foam_roll','quads'),
  ('Mobility Foam Roll Quadriceps (M)','foam_roll','quads'),
  ('Mobility Foam Roll Upper Back (M)','foam_roll','upper_back'),
  -- warmup
  ('Warmup Band External Rotation (S)','activation','shoulders'),
  ('Warmup Band Glute Activation Walk (S)','activation','glutes'),
  ('Warmup Band Pull-Apart (S)','activation','upper_back'),
  ('Warmup BW Arm Circle (M)','dynamic_warmup','shoulders'),
  ('Warmup BW Inchworm (L)','dynamic_warmup','full_body'),
  ('Warmup BW Leg Swing (M)','dynamic_warmup','hips')
) AS map(ex_name, tech, region)
JOIN public.activity_techniques t ON t.slug = map.tech
JOIN public.target_regions tr     ON tr.slug = map.region
WHERE el.name = map.ex_name;

-- ──────────────────────────────────────────────────────────────
-- 6. RLS — authenticated read, admin write
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.cardio_movements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_systems      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_techniques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.target_regions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physio_purposes     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cardio_movements_auth_read" ON public.cardio_movements;
CREATE POLICY "cardio_movements_auth_read" ON public.cardio_movements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "cardio_movements_admin_all" ON public.cardio_movements;
CREATE POLICY "cardio_movements_admin_all" ON public.cardio_movements FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cardio_movements TO authenticated;

DROP POLICY IF EXISTS "energy_systems_auth_read" ON public.energy_systems;
CREATE POLICY "energy_systems_auth_read" ON public.energy_systems FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "energy_systems_admin_all" ON public.energy_systems;
CREATE POLICY "energy_systems_admin_all" ON public.energy_systems FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.energy_systems TO authenticated;

DROP POLICY IF EXISTS "activity_techniques_auth_read" ON public.activity_techniques;
CREATE POLICY "activity_techniques_auth_read" ON public.activity_techniques FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "activity_techniques_admin_all" ON public.activity_techniques;
CREATE POLICY "activity_techniques_admin_all" ON public.activity_techniques FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_techniques TO authenticated;

DROP POLICY IF EXISTS "target_regions_auth_read" ON public.target_regions;
CREATE POLICY "target_regions_auth_read" ON public.target_regions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "target_regions_admin_all" ON public.target_regions;
CREATE POLICY "target_regions_admin_all" ON public.target_regions FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.target_regions TO authenticated;

DROP POLICY IF EXISTS "physio_purposes_auth_read" ON public.physio_purposes;
CREATE POLICY "physio_purposes_auth_read" ON public.physio_purposes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "physio_purposes_admin_all" ON public.physio_purposes;
CREATE POLICY "physio_purposes_admin_all" ON public.physio_purposes FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.physio_purposes TO authenticated;

-- Verify (expect: cardio 9 with movement, mobility+warmup 16 with technique+region):
-- SELECT category, COUNT(*) FILTER (WHERE cardio_movement_id IS NOT NULL) cm,
--   COUNT(*) FILTER (WHERE technique_id IS NOT NULL) tech
-- FROM exercise_library WHERE category IN ('cardio','mobility','warmup') GROUP BY category;
