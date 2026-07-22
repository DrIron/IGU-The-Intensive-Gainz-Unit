CREATE TABLE IF NOT EXISTS public.movement_groups (
  id text PRIMARY KEY, label text NOT NULL, sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.movement_groups (id,label,sort_order) VALUES
  ('squat','Squat',1),('press','Press',2),('hinge','Hinge',3)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.movement_pattern_groups (
  movement_pattern text PRIMARY KEY,
  movement_group_id text NOT NULL REFERENCES public.movement_groups(id),
  created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.movement_pattern_groups (movement_pattern, movement_group_id) VALUES
  ('Squat','squat'),('Squat/Press','squat'),('Sissy Squat','squat'),
  ('Press','press'),('Pressaround','press'),('Bench Press','press'),
  ('Hip Hinge','hinge'),('Deadlift','hinge'),('Thrust','hinge'),('Bridge','hinge'),
  ('Spinal Extension','hinge'),('Kickback','hinge')
ON CONFLICT (movement_pattern) DO UPDATE SET movement_group_id=EXCLUDED.movement_group_id;

ALTER TABLE public.movement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movement_pattern_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY movement_groups_read ON public.movement_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY movement_pattern_groups_read ON public.movement_pattern_groups FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.movement_groups, public.movement_pattern_groups TO authenticated, service_role;
