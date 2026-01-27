
-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE public.exercise_category AS ENUM (
  'strength', 'cardio', 'mobility', 'physio', 'warmup', 'cooldown'
);

CREATE TYPE public.program_level AS ENUM (
  'beginner', 'intermediate', 'advanced'
);

CREATE TYPE public.program_visibility AS ENUM (
  'private', 'shared'
);

CREATE TYPE public.module_status AS ENUM (
  'draft', 'published'
);

CREATE TYPE public.client_module_status AS ENUM (
  'scheduled', 'available', 'completed', 'skipped'
);

CREATE TYPE public.client_program_status AS ENUM (
  'active', 'paused', 'ended'
);

CREATE TYPE public.intensity_type AS ENUM (
  'RIR', 'RPE', 'PERCENT_1RM', 'TARGET_LOAD', 'OTHER'
);

CREATE TYPE public.exercise_section AS ENUM (
  'warmup', 'main', 'accessory', 'cooldown'
);

CREATE TYPE public.exercise_media_type AS ENUM (
  'video', 'image'
);

CREATE TYPE public.thread_author_role AS ENUM (
  'client', 'coach'
);

-- ============================================================
-- TABLE: exercise_library
-- ============================================================

CREATE TABLE public.exercise_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  primary_muscle TEXT NOT NULL,
  secondary_muscles TEXT[] DEFAULT '{}',
  equipment TEXT,
  category exercise_category NOT NULL DEFAULT 'strength',
  default_video_url TEXT,
  is_global BOOLEAN NOT NULL DEFAULT true,
  created_by_coach_id UUID REFERENCES public.coaches(user_id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_exercise_library_category ON public.exercise_library(category);
CREATE INDEX idx_exercise_library_coach ON public.exercise_library(created_by_coach_id) WHERE created_by_coach_id IS NOT NULL;
CREATE INDEX idx_exercise_library_active ON public.exercise_library(is_active) WHERE is_active = true;

ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;

-- Coaches/admins can view global or own exercises
CREATE POLICY "Coaches can view global and own exercises"
  ON public.exercise_library FOR SELECT
  TO authenticated
  USING (
    is_global = true 
    OR created_by_coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- Coaches can create custom exercises
CREATE POLICY "Coaches can create exercises"
  ON public.exercise_library FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'coach') 
    AND created_by_coach_id = auth.uid()
  );

-- Coaches can update own exercises
CREATE POLICY "Coaches can update own exercises"
  ON public.exercise_library FOR UPDATE
  TO authenticated
  USING (
    created_by_coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- ============================================================
-- TABLE: program_templates
-- ============================================================

CREATE TABLE public.program_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_coach_id UUID NOT NULL REFERENCES public.coaches(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  level program_level,
  tags TEXT[] DEFAULT '{}',
  visibility program_visibility NOT NULL DEFAULT 'private',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_program_templates_owner ON public.program_templates(owner_coach_id);
CREATE INDEX idx_program_templates_visibility ON public.program_templates(visibility);

ALTER TABLE public.program_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can view own or shared templates"
  ON public.program_templates FOR SELECT
  TO authenticated
  USING (
    owner_coach_id = auth.uid()
    OR visibility = 'shared'
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches can create templates"
  ON public.program_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'coach')
    AND owner_coach_id = auth.uid()
  );

CREATE POLICY "Coaches can update own templates"
  ON public.program_templates FOR UPDATE
  TO authenticated
  USING (owner_coach_id = auth.uid());

CREATE POLICY "Coaches can delete own templates"
  ON public.program_templates FOR DELETE
  TO authenticated
  USING (owner_coach_id = auth.uid());

-- ============================================================
-- TABLE: program_template_days
-- ============================================================

CREATE TABLE public.program_template_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_template_id UUID NOT NULL REFERENCES public.program_templates(id) ON DELETE CASCADE,
  day_index INT NOT NULL CHECK (day_index >= 1),
  day_title TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_template_id, day_index)
);

CREATE INDEX idx_template_days_program ON public.program_template_days(program_template_id);

ALTER TABLE public.program_template_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View template days via template access"
  ON public.program_template_days FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_templates pt
      WHERE pt.id = program_template_id
        AND (pt.owner_coach_id = auth.uid() OR pt.visibility = 'shared' OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Coaches can manage own template days"
  ON public.program_template_days FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.program_templates pt
      WHERE pt.id = program_template_id AND pt.owner_coach_id = auth.uid()
    )
  );

-- ============================================================
-- TABLE: day_modules
-- ============================================================

CREATE TABLE public.day_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_template_day_id UUID NOT NULL REFERENCES public.program_template_days(id) ON DELETE CASCADE,
  module_owner_coach_id UUID NOT NULL REFERENCES public.coaches(user_id) ON DELETE CASCADE,
  module_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status module_status NOT NULL DEFAULT 'draft',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_day_modules_day ON public.day_modules(program_template_day_id);
CREATE INDEX idx_day_modules_owner ON public.day_modules(module_owner_coach_id);

ALTER TABLE public.day_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Module owners can view own modules"
  ON public.day_modules FOR SELECT
  TO authenticated
  USING (
    module_owner_coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.program_template_days ptd
      JOIN public.program_templates pt ON pt.id = ptd.program_template_id
      WHERE ptd.id = program_template_day_id AND pt.owner_coach_id = auth.uid()
    )
  );

CREATE POLICY "Module owners can manage own modules"
  ON public.day_modules FOR ALL
  TO authenticated
  USING (module_owner_coach_id = auth.uid());

-- ============================================================
-- TABLE: module_exercises
-- ============================================================

CREATE TABLE public.module_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_module_id UUID NOT NULL REFERENCES public.day_modules(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercise_library(id) ON DELETE RESTRICT,
  section exercise_section NOT NULL DEFAULT 'main',
  sort_order INT NOT NULL DEFAULT 0,
  instructions TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_module_exercises_module ON public.module_exercises(day_module_id);
CREATE INDEX idx_module_exercises_exercise ON public.module_exercises(exercise_id);

ALTER TABLE public.module_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via module ownership"
  ON public.module_exercises FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.day_modules dm
      WHERE dm.id = day_module_id
        AND (dm.module_owner_coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Module owners can manage exercises"
  ON public.module_exercises FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.day_modules dm
      WHERE dm.id = day_module_id AND dm.module_owner_coach_id = auth.uid()
    )
  );

-- ============================================================
-- TABLE: exercise_prescriptions
-- ============================================================

CREATE TABLE public.exercise_prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_exercise_id UUID NOT NULL REFERENCES public.module_exercises(id) ON DELETE CASCADE,
  set_count INT NOT NULL DEFAULT 3 CHECK (set_count >= 1),
  rep_range_min INT CHECK (rep_range_min >= 0),
  rep_range_max INT CHECK (rep_range_max >= rep_range_min),
  tempo TEXT,
  rest_seconds INT CHECK (rest_seconds >= 0),
  intensity_type intensity_type,
  intensity_value NUMERIC,
  warmup_sets_json JSONB,
  custom_fields_json JSONB,
  progression_notes TEXT,
  allow_client_extra_sets BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prescriptions_exercise ON public.exercise_prescriptions(module_exercise_id);

ALTER TABLE public.exercise_prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via module exercise ownership"
  ON public.exercise_prescriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.module_exercises me
      JOIN public.day_modules dm ON dm.id = me.day_module_id
      WHERE me.id = module_exercise_id
        AND (dm.module_owner_coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Module owners can manage prescriptions"
  ON public.exercise_prescriptions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.module_exercises me
      JOIN public.day_modules dm ON dm.id = me.day_module_id
      WHERE me.id = module_exercise_id AND dm.module_owner_coach_id = auth.uid()
    )
  );

-- ============================================================
-- TABLE: client_programs
-- ============================================================

CREATE TABLE public.client_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles_public(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  primary_coach_id UUID NOT NULL REFERENCES public.coaches(user_id) ON DELETE RESTRICT,
  source_template_id UUID REFERENCES public.program_templates(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuwait',
  status client_program_status NOT NULL DEFAULT 'active',
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_programs_user ON public.client_programs(user_id);
CREATE INDEX idx_client_programs_coach ON public.client_programs(primary_coach_id);
CREATE INDEX idx_client_programs_subscription ON public.client_programs(subscription_id);
CREATE INDEX idx_client_programs_status ON public.client_programs(status) WHERE status = 'active';

ALTER TABLE public.client_programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own programs"
  ON public.client_programs FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR primary_coach_id = auth.uid()
    OR public.is_on_active_care_team_for_client(auth.uid(), user_id)
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches can create programs for clients"
  ON public.client_programs FOR INSERT
  TO authenticated
  WITH CHECK (
    primary_coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches can update client programs"
  ON public.client_programs FOR UPDATE
  TO authenticated
  USING (
    primary_coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
  );

-- ============================================================
-- TABLE: client_program_days
-- ============================================================

CREATE TABLE public.client_program_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_program_id UUID NOT NULL REFERENCES public.client_programs(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  day_index INT NOT NULL CHECK (day_index >= 1),
  title TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_program_id, date)
);

CREATE INDEX idx_client_days_program ON public.client_program_days(client_program_id);
CREATE INDEX idx_client_days_date ON public.client_program_days(date);

ALTER TABLE public.client_program_days ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via client program"
  ON public.client_program_days FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_programs cp
      WHERE cp.id = client_program_id
        AND (cp.user_id = auth.uid() OR cp.primary_coach_id = auth.uid() 
             OR public.is_on_active_care_team_for_client(auth.uid(), cp.user_id)
             OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Coaches can manage client days"
  ON public.client_program_days FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_programs cp
      WHERE cp.id = client_program_id
        AND (cp.primary_coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- ============================================================
-- TABLE: client_day_modules
-- ============================================================

CREATE TABLE public.client_day_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_program_day_id UUID NOT NULL REFERENCES public.client_program_days(id) ON DELETE CASCADE,
  module_owner_coach_id UUID NOT NULL REFERENCES public.coaches(user_id) ON DELETE RESTRICT,
  module_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status client_module_status NOT NULL DEFAULT 'scheduled',
  completed_at TIMESTAMPTZ,
  sort_order INT NOT NULL DEFAULT 0,
  source_day_module_id UUID REFERENCES public.day_modules(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_modules_day ON public.client_day_modules(client_program_day_id);
CREATE INDEX idx_client_modules_owner ON public.client_day_modules(module_owner_coach_id);
CREATE INDEX idx_client_modules_status ON public.client_day_modules(status);

ALTER TABLE public.client_day_modules ENABLE ROW LEVEL SECURITY;

-- Clients can view their modules; coaches can view modules they own or for their clients
CREATE POLICY "View client modules"
  ON public.client_day_modules FOR SELECT
  TO authenticated
  USING (
    module_owner_coach_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.client_program_days cpd
      JOIN public.client_programs cp ON cp.id = cpd.client_program_id
      WHERE cpd.id = client_program_day_id
        AND (cp.user_id = auth.uid() OR cp.primary_coach_id = auth.uid()
             OR public.is_on_active_care_team_for_client(auth.uid(), cp.user_id))
    )
  );

-- Module owners can manage their modules
CREATE POLICY "Module owners can manage client modules"
  ON public.client_day_modules FOR ALL
  TO authenticated
  USING (module_owner_coach_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- ============================================================
-- TABLE: client_module_exercises
-- ============================================================

CREATE TABLE public.client_module_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_day_module_id UUID NOT NULL REFERENCES public.client_day_modules(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.exercise_library(id) ON DELETE RESTRICT,
  section exercise_section NOT NULL DEFAULT 'main',
  sort_order INT NOT NULL DEFAULT 0,
  instructions TEXT,
  prescription_snapshot_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_exercises_module ON public.client_module_exercises(client_day_module_id);
CREATE INDEX idx_client_exercises_exercise ON public.client_module_exercises(exercise_id);

ALTER TABLE public.client_module_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via client module"
  ON public.client_module_exercises FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_day_modules cdm
      JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
      JOIN public.client_programs cp ON cp.id = cpd.client_program_id
      WHERE cdm.id = client_day_module_id
        AND (cp.user_id = auth.uid() OR cdm.module_owner_coach_id = auth.uid()
             OR cp.primary_coach_id = auth.uid()
             OR public.is_on_active_care_team_for_client(auth.uid(), cp.user_id)
             OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Module owners can manage client exercises"
  ON public.client_module_exercises FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_day_modules cdm
      WHERE cdm.id = client_day_module_id AND cdm.module_owner_coach_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'admin')
  );

-- ============================================================
-- TABLE: exercise_set_logs
-- ============================================================

CREATE TABLE public.exercise_set_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_module_exercise_id UUID NOT NULL REFERENCES public.client_module_exercises(id) ON DELETE CASCADE,
  set_index INT NOT NULL CHECK (set_index >= 1),
  prescribed JSONB NOT NULL DEFAULT '{}',
  performed_reps INT CHECK (performed_reps >= 0),
  performed_load NUMERIC CHECK (performed_load >= 0),
  performed_rir NUMERIC,
  performed_rpe NUMERIC CHECK (performed_rpe >= 0 AND performed_rpe <= 10),
  notes TEXT,
  created_by_user_id UUID NOT NULL REFERENCES public.profiles_public(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_module_exercise_id, set_index)
);

CREATE INDEX idx_set_logs_exercise ON public.exercise_set_logs(client_module_exercise_id);
CREATE INDEX idx_set_logs_user ON public.exercise_set_logs(created_by_user_id);

ALTER TABLE public.exercise_set_logs ENABLE ROW LEVEL SECURITY;

-- Clients can log their own sets
CREATE POLICY "Clients can create own set logs"
  ON public.exercise_set_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.client_module_exercises cme
      JOIN public.client_day_modules cdm ON cdm.id = cme.client_day_module_id
      JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
      JOIN public.client_programs cp ON cp.id = cpd.client_program_id
      WHERE cme.id = client_module_exercise_id AND cp.user_id = auth.uid()
    )
  );

-- Clients can view own logs; coaches can view logs for their modules/clients
CREATE POLICY "View set logs"
  ON public.exercise_set_logs FOR SELECT
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.client_module_exercises cme
      JOIN public.client_day_modules cdm ON cdm.id = cme.client_day_module_id
      JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
      JOIN public.client_programs cp ON cp.id = cpd.client_program_id
      WHERE cme.id = client_module_exercise_id
        AND (cdm.module_owner_coach_id = auth.uid() OR cp.primary_coach_id = auth.uid()
             OR public.is_on_active_care_team_for_client(auth.uid(), cp.user_id))
    )
  );

-- Clients can update own logs
CREATE POLICY "Clients can update own set logs"
  ON public.exercise_set_logs FOR UPDATE
  TO authenticated
  USING (created_by_user_id = auth.uid());

-- ============================================================
-- TABLE: exercise_media
-- ============================================================

CREATE TABLE public.exercise_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_module_exercise_id UUID NOT NULL REFERENCES public.client_module_exercises(id) ON DELETE CASCADE,
  uploader_user_id UUID NOT NULL REFERENCES public.profiles_public(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  media_type exercise_media_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_exercise_media_exercise ON public.exercise_media(client_module_exercise_id);
CREATE INDEX idx_exercise_media_uploader ON public.exercise_media(uploader_user_id);

ALTER TABLE public.exercise_media ENABLE ROW LEVEL SECURITY;

-- Clients can upload media for own exercises
CREATE POLICY "Clients can upload own media"
  ON public.exercise_media FOR INSERT
  TO authenticated
  WITH CHECK (
    uploader_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.client_module_exercises cme
      JOIN public.client_day_modules cdm ON cdm.id = cme.client_day_module_id
      JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
      JOIN public.client_programs cp ON cp.id = cpd.client_program_id
      WHERE cme.id = client_module_exercise_id AND cp.user_id = auth.uid()
    )
  );

-- View media
CREATE POLICY "View exercise media"
  ON public.exercise_media FOR SELECT
  TO authenticated
  USING (
    uploader_user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.client_module_exercises cme
      JOIN public.client_day_modules cdm ON cdm.id = cme.client_day_module_id
      JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
      JOIN public.client_programs cp ON cp.id = cpd.client_program_id
      WHERE cme.id = client_module_exercise_id
        AND (cdm.module_owner_coach_id = auth.uid() OR cp.primary_coach_id = auth.uid()
             OR public.is_on_active_care_team_for_client(auth.uid(), cp.user_id))
    )
  );

-- Clients can delete own media
CREATE POLICY "Clients can delete own media"
  ON public.exercise_media FOR DELETE
  TO authenticated
  USING (uploader_user_id = auth.uid());

-- ============================================================
-- TABLE: module_threads
-- ============================================================

CREATE TABLE public.module_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_day_module_id UUID NOT NULL UNIQUE REFERENCES public.client_day_modules(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_module_threads_module ON public.module_threads(client_day_module_id);

ALTER TABLE public.module_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access threads via module"
  ON public.module_threads FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.client_day_modules cdm
      JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
      JOIN public.client_programs cp ON cp.id = cpd.client_program_id
      WHERE cdm.id = client_day_module_id
        AND (cp.user_id = auth.uid() OR cdm.module_owner_coach_id = auth.uid()
             OR cp.primary_coach_id = auth.uid()
             OR public.is_on_active_care_team_for_client(auth.uid(), cp.user_id)
             OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Create threads"
  ON public.module_threads FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.client_day_modules cdm
      JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
      JOIN public.client_programs cp ON cp.id = cpd.client_program_id
      WHERE cdm.id = client_day_module_id
        AND (cp.user_id = auth.uid() OR cdm.module_owner_coach_id = auth.uid())
    )
  );

-- ============================================================
-- TABLE: module_thread_messages
-- ============================================================

CREATE TABLE public.module_thread_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.module_threads(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES public.profiles_public(id) ON DELETE CASCADE,
  author_role thread_author_role NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_thread_messages_thread ON public.module_thread_messages(thread_id);
CREATE INDEX idx_thread_messages_author ON public.module_thread_messages(author_user_id);

ALTER TABLE public.module_thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View thread messages"
  ON public.module_thread_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.module_threads mt
      JOIN public.client_day_modules cdm ON cdm.id = mt.client_day_module_id
      JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
      JOIN public.client_programs cp ON cp.id = cpd.client_program_id
      WHERE mt.id = thread_id
        AND (cp.user_id = auth.uid() OR cdm.module_owner_coach_id = auth.uid()
             OR cp.primary_coach_id = auth.uid()
             OR public.is_on_active_care_team_for_client(auth.uid(), cp.user_id)
             OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Create thread messages"
  ON public.module_thread_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.module_threads mt
      JOIN public.client_day_modules cdm ON cdm.id = mt.client_day_module_id
      JOIN public.client_program_days cpd ON cpd.id = cdm.client_program_day_id
      JOIN public.client_programs cp ON cp.id = cpd.client_program_id
      WHERE mt.id = thread_id
        AND (cp.user_id = auth.uid() OR cdm.module_owner_coach_id = auth.uid())
    )
  );

-- ============================================================
-- TRIGGERS: updated_at
-- ============================================================

CREATE TRIGGER update_exercise_library_updated_at
  BEFORE UPDATE ON public.exercise_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_program_templates_updated_at
  BEFORE UPDATE ON public.program_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_program_template_days_updated_at
  BEFORE UPDATE ON public.program_template_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_day_modules_updated_at
  BEFORE UPDATE ON public.day_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_module_exercises_updated_at
  BEFORE UPDATE ON public.module_exercises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_exercise_prescriptions_updated_at
  BEFORE UPDATE ON public.exercise_prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_programs_updated_at
  BEFORE UPDATE ON public.client_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_program_days_updated_at
  BEFORE UPDATE ON public.client_program_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_day_modules_updated_at
  BEFORE UPDATE ON public.client_day_modules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_module_exercises_updated_at
  BEFORE UPDATE ON public.client_module_exercises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('exercise-videos', 'exercise-videos', false, 104857600, ARRAY['video/mp4', 'video/quicktime', 'video/webm']),
  ('client-exercise-videos', 'client-exercise-videos', false, 104857600, ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']);

-- Storage policies for exercise-videos (coach uploads)
CREATE POLICY "Coaches can upload exercise videos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'exercise-videos'
    AND public.has_role(auth.uid(), 'coach')
  );

CREATE POLICY "Coaches and admins can view exercise videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'exercise-videos'
    AND (public.has_role(auth.uid(), 'coach') OR public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Coaches can delete own exercise videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'exercise-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for client-exercise-videos
CREATE POLICY "Clients can upload to own folder"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'client-exercise-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "View client exercise videos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'client-exercise-videos'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'coach')
      OR public.has_role(auth.uid(), 'admin')
    )
  );

CREATE POLICY "Clients can delete own videos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'client-exercise-videos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================

COMMENT ON TABLE public.exercise_library IS 'Global and coach-custom exercise definitions';
COMMENT ON TABLE public.program_templates IS 'Coach-owned workout program templates';
COMMENT ON TABLE public.program_template_days IS 'Days within program templates';
COMMENT ON TABLE public.day_modules IS 'Module slices within template days (owned by specific coach)';
COMMENT ON TABLE public.module_exercises IS 'Exercises within modules';
COMMENT ON TABLE public.exercise_prescriptions IS 'Set/rep/intensity prescriptions for exercises';
COMMENT ON TABLE public.client_programs IS 'Assigned program instances for clients';
COMMENT ON TABLE public.client_program_days IS 'Instanced days for client programs';
COMMENT ON TABLE public.client_day_modules IS 'Instanced modules preserving owner + permissions';
COMMENT ON TABLE public.client_module_exercises IS 'Instanced exercises with frozen prescriptions';
COMMENT ON TABLE public.exercise_set_logs IS 'Client workout logging per set';
COMMENT ON TABLE public.exercise_media IS 'Video/image uploads from clients';
COMMENT ON TABLE public.module_threads IS 'Communication threads per module';
COMMENT ON TABLE public.module_thread_messages IS 'Messages within module threads';
