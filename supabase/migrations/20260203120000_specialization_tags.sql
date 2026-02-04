-- Create specialization_tags table for standardized coach specializations
CREATE TABLE IF NOT EXISTS public.specialization_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Insert default specialization tags
INSERT INTO public.specialization_tags (name, display_order) VALUES
  ('Bodybuilding', 1), ('Powerlifting', 2), ('Weight Loss', 3),
  ('Body Recomposition', 4), ('Sports Performance', 5), ('Strength & Conditioning', 6),
  ('Functional Training', 7), ('Pre/Post Natal', 8), ('Mobility & Rehab', 9),
  ('Nutrition Coaching', 10), ('Yoga', 11), ('Pilates', 12),
  ('Physiotherapist', 13), ('Dietician', 14)
ON CONFLICT (name) DO NOTHING;

-- Enable Row Level Security
ALTER TABLE public.specialization_tags ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Anyone can read active specialization tags" ON public.specialization_tags;
DROP POLICY IF EXISTS "Admins can insert specialization tags" ON public.specialization_tags;
DROP POLICY IF EXISTS "Admins can update specialization tags" ON public.specialization_tags;
DROP POLICY IF EXISTS "Admins can delete specialization tags" ON public.specialization_tags;

-- Policy: Anyone authenticated can read active specialization tags
CREATE POLICY "Anyone can read active specialization tags"
  ON public.specialization_tags FOR SELECT TO authenticated USING (true);

-- Policy: Only admins can insert specialization tags
CREATE POLICY "Admins can insert specialization tags"
  ON public.specialization_tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));

-- Policy: Only admins can update specialization tags
CREATE POLICY "Admins can update specialization tags"
  ON public.specialization_tags FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));

-- Policy: Only admins can delete specialization tags
CREATE POLICY "Admins can delete specialization tags"
  ON public.specialization_tags FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'));

-- Index for efficient querying of active tags by display order
CREATE INDEX IF NOT EXISTS idx_specialization_tags_active_order
  ON public.specialization_tags (is_active, display_order) WHERE is_active = true;
