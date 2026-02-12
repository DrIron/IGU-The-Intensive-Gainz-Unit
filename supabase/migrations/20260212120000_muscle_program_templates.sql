-- ============================================================
-- Muscle Program Templates
-- Planning layer for "muscle-first" workout builder
-- Stores weekly muscle placement config as JSONB
-- ============================================================

CREATE TABLE public.muscle_program_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coaches(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Untitled Muscle Plan',
  description TEXT,
  slot_config JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- slot_config schema: [{dayIndex:1, muscleId:"pecs", sets:6, sortOrder:0}, ...]
  is_preset BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  converted_program_id UUID REFERENCES public.program_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mpt_coach ON public.muscle_program_templates(coach_id);

ALTER TABLE public.muscle_program_templates ENABLE ROW LEVEL SECURITY;

-- Coaches see own templates + system templates; admins see all
CREATE POLICY "coach_own_templates" ON public.muscle_program_templates
  FOR SELECT TO authenticated
  USING (
    coach_id = auth.uid()
    OR is_system = true
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "coach_insert_templates" ON public.muscle_program_templates
  FOR INSERT TO authenticated
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "coach_update_own_templates" ON public.muscle_program_templates
  FOR UPDATE TO authenticated
  USING (coach_id = auth.uid());

CREATE POLICY "coach_delete_own_templates" ON public.muscle_program_templates
  FOR DELETE TO authenticated
  USING (coach_id = auth.uid());
