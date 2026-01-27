-- ============================================================================
-- WORKOUT TABLES RLS POLICIES
-- Module-owner enforcement + time-based coach access
-- ============================================================================

-- Helper function: Check if user is the module owner
CREATE OR REPLACE FUNCTION public.is_module_owner(p_user_id uuid, p_module_owner_coach_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p_user_id = p_module_owner_coach_id
$$;

-- Helper function: Check if coach has active access to a client (primary OR care team)
CREATE OR REPLACE FUNCTION public.has_active_coach_access_to_client(p_coach_uid uuid, p_client_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    -- Is currently primary coach with active subscription
    public.is_primary_coach_for_user(p_coach_uid, p_client_uid)
    OR
    -- Is on active care team
    public.is_on_active_care_team_for_client(p_coach_uid, p_client_uid)
$$;

-- Helper function: Get client_id from client_program_id
CREATE OR REPLACE FUNCTION public.get_client_from_program(p_program_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT user_id FROM public.client_programs WHERE id = p_program_id
$$;

-- Helper function: Get client_id from client_program_day_id
CREATE OR REPLACE FUNCTION public.get_client_from_program_day(p_day_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cp.user_id 
  FROM public.client_program_days cpd
  JOIN public.client_programs cp ON cpd.client_program_id = cp.id
  WHERE cpd.id = p_day_id
$$;

-- Helper function: Get client_id from client_day_module_id
CREATE OR REPLACE FUNCTION public.get_client_from_day_module(p_module_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cp.user_id 
  FROM public.client_day_modules cdm
  JOIN public.client_program_days cpd ON cdm.client_program_day_id = cpd.id
  JOIN public.client_programs cp ON cpd.client_program_id = cp.id
  WHERE cdm.id = p_module_id
$$;

-- Helper function: Get module_owner from client_day_module_id
CREATE OR REPLACE FUNCTION public.get_module_owner_from_day_module(p_module_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT module_owner_coach_id FROM public.client_day_modules WHERE id = p_module_id
$$;

-- Helper function: Get client_id from client_module_exercise_id
CREATE OR REPLACE FUNCTION public.get_client_from_module_exercise(p_exercise_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cp.user_id 
  FROM public.client_module_exercises cme
  JOIN public.client_day_modules cdm ON cme.client_day_module_id = cdm.id
  JOIN public.client_program_days cpd ON cdm.client_program_day_id = cpd.id
  JOIN public.client_programs cp ON cpd.client_program_id = cp.id
  WHERE cme.id = p_exercise_id
$$;

-- Helper function: Get module_owner from client_module_exercise_id
CREATE OR REPLACE FUNCTION public.get_module_owner_from_exercise(p_exercise_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cdm.module_owner_coach_id 
  FROM public.client_module_exercises cme
  JOIN public.client_day_modules cdm ON cme.client_day_module_id = cdm.id
  WHERE cme.id = p_exercise_id
$$;

-- ============================================================================
-- EXERCISE LIBRARY POLICIES
-- ============================================================================

-- Drop existing policies if any
DROP POLICY IF EXISTS "exercise_library_select" ON public.exercise_library;
DROP POLICY IF EXISTS "exercise_library_insert" ON public.exercise_library;
DROP POLICY IF EXISTS "exercise_library_update" ON public.exercise_library;
DROP POLICY IF EXISTS "exercise_library_delete" ON public.exercise_library;

-- SELECT: Global exercises readable by all authenticated; custom exercises by creator + admin
CREATE POLICY "exercise_library_select" ON public.exercise_library
FOR SELECT TO authenticated
USING (
  is_global = true 
  OR public.is_admin(auth.uid())
  OR created_by_coach_id = auth.uid()
);

-- INSERT: Coaches can create custom exercises
CREATE POLICY "exercise_library_insert" ON public.exercise_library
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR (public.is_coach(auth.uid()) AND created_by_coach_id = auth.uid())
);

-- UPDATE: Only creator or admin
CREATE POLICY "exercise_library_update" ON public.exercise_library
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR created_by_coach_id = auth.uid()
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR created_by_coach_id = auth.uid()
);

-- DELETE: Only admin
CREATE POLICY "exercise_library_delete" ON public.exercise_library
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- PROGRAM TEMPLATES POLICIES (Coach Library)
-- ============================================================================

DROP POLICY IF EXISTS "program_templates_select" ON public.program_templates;
DROP POLICY IF EXISTS "program_templates_insert" ON public.program_templates;
DROP POLICY IF EXISTS "program_templates_update" ON public.program_templates;
DROP POLICY IF EXISTS "program_templates_delete" ON public.program_templates;

-- SELECT: Owner coach + admin + shared templates visible to all coaches
CREATE POLICY "program_templates_select" ON public.program_templates
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR owner_coach_id = auth.uid()
  OR (visibility = 'shared' AND public.is_coach(auth.uid()))
);

-- INSERT: Coaches can create their own templates
CREATE POLICY "program_templates_insert" ON public.program_templates
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR (public.is_coach(auth.uid()) AND owner_coach_id = auth.uid())
);

-- UPDATE: Only owner or admin
CREATE POLICY "program_templates_update" ON public.program_templates
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR owner_coach_id = auth.uid()
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR owner_coach_id = auth.uid()
);

-- DELETE: Only owner or admin
CREATE POLICY "program_templates_delete" ON public.program_templates
FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR owner_coach_id = auth.uid()
);

-- ============================================================================
-- PROGRAM TEMPLATE DAYS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "program_template_days_select" ON public.program_template_days;
DROP POLICY IF EXISTS "program_template_days_insert" ON public.program_template_days;
DROP POLICY IF EXISTS "program_template_days_update" ON public.program_template_days;
DROP POLICY IF EXISTS "program_template_days_delete" ON public.program_template_days;

-- SELECT: If can see parent template
CREATE POLICY "program_template_days_select" ON public.program_template_days
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.program_templates pt
    WHERE pt.id = program_template_days.program_template_id
    AND (pt.owner_coach_id = auth.uid() OR (pt.visibility = 'shared' AND public.is_coach(auth.uid())))
  )
);

-- INSERT: If owns parent template
CREATE POLICY "program_template_days_insert" ON public.program_template_days
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.program_templates pt
    WHERE pt.id = program_template_days.program_template_id
    AND pt.owner_coach_id = auth.uid()
  )
);

-- UPDATE: If owns parent template
CREATE POLICY "program_template_days_update" ON public.program_template_days
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.program_templates pt
    WHERE pt.id = program_template_days.program_template_id
    AND pt.owner_coach_id = auth.uid()
  )
);

-- DELETE: If owns parent template
CREATE POLICY "program_template_days_delete" ON public.program_template_days
FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.program_templates pt
    WHERE pt.id = program_template_days.program_template_id
    AND pt.owner_coach_id = auth.uid()
  )
);

-- ============================================================================
-- DAY MODULES POLICIES (Template Modules)
-- ============================================================================

DROP POLICY IF EXISTS "day_modules_select" ON public.day_modules;
DROP POLICY IF EXISTS "day_modules_insert" ON public.day_modules;
DROP POLICY IF EXISTS "day_modules_update" ON public.day_modules;
DROP POLICY IF EXISTS "day_modules_delete" ON public.day_modules;

-- SELECT: Module owner + template owner + admin
CREATE POLICY "day_modules_select" ON public.day_modules
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR module_owner_coach_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.program_template_days ptd
    JOIN public.program_templates pt ON ptd.program_template_id = pt.id
    WHERE ptd.id = day_modules.program_template_day_id
    AND (pt.owner_coach_id = auth.uid() OR (pt.visibility = 'shared' AND public.is_coach(auth.uid())))
  )
);

-- INSERT: Module owner can add their modules to templates they have access to
CREATE POLICY "day_modules_insert" ON public.day_modules
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    module_owner_coach_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.program_template_days ptd
      JOIN public.program_templates pt ON ptd.program_template_id = pt.id
      WHERE ptd.id = day_modules.program_template_day_id
      AND (pt.owner_coach_id = auth.uid() OR pt.visibility = 'shared')
    )
  )
);

-- UPDATE: Only module owner or admin
CREATE POLICY "day_modules_update" ON public.day_modules
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR module_owner_coach_id = auth.uid()
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR module_owner_coach_id = auth.uid()
);

-- DELETE: Only module owner or admin
CREATE POLICY "day_modules_delete" ON public.day_modules
FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR module_owner_coach_id = auth.uid()
);

-- ============================================================================
-- MODULE EXERCISES POLICIES (Template)
-- ============================================================================

DROP POLICY IF EXISTS "module_exercises_select" ON public.module_exercises;
DROP POLICY IF EXISTS "module_exercises_insert" ON public.module_exercises;
DROP POLICY IF EXISTS "module_exercises_update" ON public.module_exercises;
DROP POLICY IF EXISTS "module_exercises_delete" ON public.module_exercises;

-- SELECT: If can see parent module
CREATE POLICY "module_exercises_select" ON public.module_exercises
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.day_modules dm
    WHERE dm.id = module_exercises.day_module_id
    AND (dm.module_owner_coach_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.program_template_days ptd
      JOIN public.program_templates pt ON ptd.program_template_id = pt.id
      WHERE ptd.id = dm.program_template_day_id
      AND (pt.owner_coach_id = auth.uid() OR (pt.visibility = 'shared' AND public.is_coach(auth.uid())))
    ))
  )
);

-- INSERT: Only module owner
CREATE POLICY "module_exercises_insert" ON public.module_exercises
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.day_modules dm
    WHERE dm.id = module_exercises.day_module_id
    AND dm.module_owner_coach_id = auth.uid()
  )
);

-- UPDATE: Only module owner
CREATE POLICY "module_exercises_update" ON public.module_exercises
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.day_modules dm
    WHERE dm.id = module_exercises.day_module_id
    AND dm.module_owner_coach_id = auth.uid()
  )
);

-- DELETE: Only module owner
CREATE POLICY "module_exercises_delete" ON public.module_exercises
FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.day_modules dm
    WHERE dm.id = module_exercises.day_module_id
    AND dm.module_owner_coach_id = auth.uid()
  )
);

-- ============================================================================
-- EXERCISE PRESCRIPTIONS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "exercise_prescriptions_select" ON public.exercise_prescriptions;
DROP POLICY IF EXISTS "exercise_prescriptions_insert" ON public.exercise_prescriptions;
DROP POLICY IF EXISTS "exercise_prescriptions_update" ON public.exercise_prescriptions;
DROP POLICY IF EXISTS "exercise_prescriptions_delete" ON public.exercise_prescriptions;

-- SELECT: If can see parent module exercise
CREATE POLICY "exercise_prescriptions_select" ON public.exercise_prescriptions
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.module_exercises me
    JOIN public.day_modules dm ON me.day_module_id = dm.id
    WHERE me.id = exercise_prescriptions.module_exercise_id
    AND (dm.module_owner_coach_id = auth.uid() OR EXISTS (
      SELECT 1 FROM public.program_template_days ptd
      JOIN public.program_templates pt ON ptd.program_template_id = pt.id
      WHERE ptd.id = dm.program_template_day_id
      AND (pt.owner_coach_id = auth.uid() OR (pt.visibility = 'shared' AND public.is_coach(auth.uid())))
    ))
  )
);

-- INSERT/UPDATE/DELETE: Only module owner
CREATE POLICY "exercise_prescriptions_insert" ON public.exercise_prescriptions
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.module_exercises me
    JOIN public.day_modules dm ON me.day_module_id = dm.id
    WHERE me.id = exercise_prescriptions.module_exercise_id
    AND dm.module_owner_coach_id = auth.uid()
  )
);

CREATE POLICY "exercise_prescriptions_update" ON public.exercise_prescriptions
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.module_exercises me
    JOIN public.day_modules dm ON me.day_module_id = dm.id
    WHERE me.id = exercise_prescriptions.module_exercise_id
    AND dm.module_owner_coach_id = auth.uid()
  )
);

CREATE POLICY "exercise_prescriptions_delete" ON public.exercise_prescriptions
FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.module_exercises me
    JOIN public.day_modules dm ON me.day_module_id = dm.id
    WHERE me.id = exercise_prescriptions.module_exercise_id
    AND dm.module_owner_coach_id = auth.uid()
  )
);

-- ============================================================================
-- CLIENT PROGRAMS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "client_programs_select" ON public.client_programs;
DROP POLICY IF EXISTS "client_programs_insert" ON public.client_programs;
DROP POLICY IF EXISTS "client_programs_update" ON public.client_programs;
DROP POLICY IF EXISTS "client_programs_delete" ON public.client_programs;

-- SELECT: Client + active coaches + admin
CREATE POLICY "client_programs_select" ON public.client_programs
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR user_id = auth.uid()
  OR public.has_active_coach_access_to_client(auth.uid(), user_id)
);

-- INSERT: Primary coach or admin only
CREATE POLICY "client_programs_insert" ON public.client_programs
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR (primary_coach_id = auth.uid() AND public.is_primary_coach_for_user(auth.uid(), user_id))
);

-- UPDATE: Primary coach or admin
CREATE POLICY "client_programs_update" ON public.client_programs
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR primary_coach_id = auth.uid()
);

-- DELETE: Admin only
CREATE POLICY "client_programs_delete" ON public.client_programs
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- CLIENT PROGRAM DAYS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "client_program_days_select" ON public.client_program_days;
DROP POLICY IF EXISTS "client_program_days_insert" ON public.client_program_days;
DROP POLICY IF EXISTS "client_program_days_update" ON public.client_program_days;
DROP POLICY IF EXISTS "client_program_days_delete" ON public.client_program_days;

-- SELECT: If can see parent program
CREATE POLICY "client_program_days_select" ON public.client_program_days
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.client_programs cp
    WHERE cp.id = client_program_days.client_program_id
    AND (cp.user_id = auth.uid() OR public.has_active_coach_access_to_client(auth.uid(), cp.user_id))
  )
);

-- INSERT: Primary coach only
CREATE POLICY "client_program_days_insert" ON public.client_program_days
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.client_programs cp
    WHERE cp.id = client_program_days.client_program_id
    AND cp.primary_coach_id = auth.uid()
  )
);

-- UPDATE: Primary coach only
CREATE POLICY "client_program_days_update" ON public.client_program_days
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.client_programs cp
    WHERE cp.id = client_program_days.client_program_id
    AND cp.primary_coach_id = auth.uid()
  )
);

-- DELETE: Admin only
CREATE POLICY "client_program_days_delete" ON public.client_program_days
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- CLIENT DAY MODULES POLICIES (Critical: Module Owner Enforcement)
-- ============================================================================

DROP POLICY IF EXISTS "client_day_modules_select" ON public.client_day_modules;
DROP POLICY IF EXISTS "client_day_modules_insert" ON public.client_day_modules;
DROP POLICY IF EXISTS "client_day_modules_update" ON public.client_day_modules;
DROP POLICY IF EXISTS "client_day_modules_delete" ON public.client_day_modules;

-- SELECT: Client + active coaches + admin
CREATE POLICY "client_day_modules_select" ON public.client_day_modules
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.get_client_from_program_day(client_program_day_id) = auth.uid()
  OR public.has_active_coach_access_to_client(auth.uid(), public.get_client_from_program_day(client_program_day_id))
);

-- INSERT: Module owner coach (care team member) OR primary coach for their own modules
CREATE POLICY "client_day_modules_insert" ON public.client_day_modules
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    module_owner_coach_id = auth.uid()
    AND public.has_active_coach_access_to_client(auth.uid(), public.get_client_from_program_day(client_program_day_id))
  )
);

-- UPDATE: ONLY module owner can update (primary coach read-only for other modules)
CREATE POLICY "client_day_modules_update" ON public.client_day_modules
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR module_owner_coach_id = auth.uid()
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR module_owner_coach_id = auth.uid()
);

-- DELETE: Admin or module owner
CREATE POLICY "client_day_modules_delete" ON public.client_day_modules
FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR module_owner_coach_id = auth.uid()
);

-- ============================================================================
-- CLIENT MODULE EXERCISES POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "client_module_exercises_select" ON public.client_module_exercises;
DROP POLICY IF EXISTS "client_module_exercises_insert" ON public.client_module_exercises;
DROP POLICY IF EXISTS "client_module_exercises_update" ON public.client_module_exercises;
DROP POLICY IF EXISTS "client_module_exercises_delete" ON public.client_module_exercises;

-- SELECT: Client + active coaches + admin
CREATE POLICY "client_module_exercises_select" ON public.client_module_exercises
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.get_client_from_day_module(client_day_module_id) = auth.uid()
  OR public.has_active_coach_access_to_client(auth.uid(), public.get_client_from_day_module(client_day_module_id))
);

-- INSERT: Only module owner
CREATE POLICY "client_module_exercises_insert" ON public.client_module_exercises
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.client_day_modules cdm
    WHERE cdm.id = client_module_exercises.client_day_module_id
    AND cdm.module_owner_coach_id = auth.uid()
  )
);

-- UPDATE: Only module owner
CREATE POLICY "client_module_exercises_update" ON public.client_module_exercises
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.client_day_modules cdm
    WHERE cdm.id = client_module_exercises.client_day_module_id
    AND cdm.module_owner_coach_id = auth.uid()
  )
);

-- DELETE: Only module owner or admin
CREATE POLICY "client_module_exercises_delete" ON public.client_module_exercises
FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.client_day_modules cdm
    WHERE cdm.id = client_module_exercises.client_day_module_id
    AND cdm.module_owner_coach_id = auth.uid()
  )
);

-- ============================================================================
-- EXERCISE SET LOGS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "exercise_set_logs_select" ON public.exercise_set_logs;
DROP POLICY IF EXISTS "exercise_set_logs_insert" ON public.exercise_set_logs;
DROP POLICY IF EXISTS "exercise_set_logs_update" ON public.exercise_set_logs;
DROP POLICY IF EXISTS "exercise_set_logs_delete" ON public.exercise_set_logs;

-- SELECT: Client (own logs) + active coaches + admin
CREATE POLICY "exercise_set_logs_select" ON public.exercise_set_logs
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR created_by_user_id = auth.uid()
  OR public.has_active_coach_access_to_client(auth.uid(), public.get_client_from_module_exercise(client_module_exercise_id))
);

-- INSERT: Client can log their own sets
CREATE POLICY "exercise_set_logs_insert" ON public.exercise_set_logs
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    created_by_user_id = auth.uid()
    AND public.get_client_from_module_exercise(client_module_exercise_id) = auth.uid()
  )
);

-- UPDATE: Client can update their own logs
CREATE POLICY "exercise_set_logs_update" ON public.exercise_set_logs
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR created_by_user_id = auth.uid()
);

-- DELETE: Admin only
CREATE POLICY "exercise_set_logs_delete" ON public.exercise_set_logs
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- EXERCISE MEDIA POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "exercise_media_select" ON public.exercise_media;
DROP POLICY IF EXISTS "exercise_media_insert" ON public.exercise_media;
DROP POLICY IF EXISTS "exercise_media_update" ON public.exercise_media;
DROP POLICY IF EXISTS "exercise_media_delete" ON public.exercise_media;

-- SELECT: Client (own) + module owner coach + admin
CREATE POLICY "exercise_media_select" ON public.exercise_media
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR uploader_user_id = auth.uid()
  OR public.get_module_owner_from_exercise(client_module_exercise_id) = auth.uid()
);

-- INSERT: Client can upload their own media
CREATE POLICY "exercise_media_insert" ON public.exercise_media
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    uploader_user_id = auth.uid()
    AND public.get_client_from_module_exercise(client_module_exercise_id) = auth.uid()
  )
);

-- UPDATE: Client (own) or admin
CREATE POLICY "exercise_media_update" ON public.exercise_media
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR uploader_user_id = auth.uid()
);

-- DELETE: Client (own) or admin
CREATE POLICY "exercise_media_delete" ON public.exercise_media
FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR uploader_user_id = auth.uid()
);

-- ============================================================================
-- MODULE THREADS POLICIES
-- ============================================================================

DROP POLICY IF EXISTS "module_threads_select" ON public.module_threads;
DROP POLICY IF EXISTS "module_threads_insert" ON public.module_threads;
DROP POLICY IF EXISTS "module_threads_update" ON public.module_threads;
DROP POLICY IF EXISTS "module_threads_delete" ON public.module_threads;

-- SELECT: Client + active coaches (can view threads) + admin
CREATE POLICY "module_threads_select" ON public.module_threads
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.get_client_from_day_module(client_day_module_id) = auth.uid()
  OR public.has_active_coach_access_to_client(auth.uid(), public.get_client_from_day_module(client_day_module_id))
);

-- INSERT: Client or module owner can create thread
CREATE POLICY "module_threads_insert" ON public.module_threads
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.get_client_from_day_module(client_day_module_id) = auth.uid()
  OR public.get_module_owner_from_day_module(client_day_module_id) = auth.uid()
);

-- UPDATE/DELETE: Admin only
CREATE POLICY "module_threads_update" ON public.module_threads
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "module_threads_delete" ON public.module_threads
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

-- ============================================================================
-- MODULE THREAD MESSAGES POLICIES (Critical: Only module owner can reply)
-- ============================================================================

DROP POLICY IF EXISTS "module_thread_messages_select" ON public.module_thread_messages;
DROP POLICY IF EXISTS "module_thread_messages_insert" ON public.module_thread_messages;
DROP POLICY IF EXISTS "module_thread_messages_update" ON public.module_thread_messages;
DROP POLICY IF EXISTS "module_thread_messages_delete" ON public.module_thread_messages;

-- Helper function: Get module owner from thread
CREATE OR REPLACE FUNCTION public.get_module_owner_from_thread(p_thread_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cdm.module_owner_coach_id 
  FROM public.module_threads mt
  JOIN public.client_day_modules cdm ON mt.client_day_module_id = cdm.id
  WHERE mt.id = p_thread_id
$$;

-- Helper function: Get client from thread
CREATE OR REPLACE FUNCTION public.get_client_from_thread(p_thread_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cp.user_id 
  FROM public.module_threads mt
  JOIN public.client_day_modules cdm ON mt.client_day_module_id = cdm.id
  JOIN public.client_program_days cpd ON cdm.client_program_day_id = cpd.id
  JOIN public.client_programs cp ON cpd.client_program_id = cp.id
  WHERE mt.id = p_thread_id
$$;

-- SELECT: Client + active coaches (read-only for non-owners) + admin
CREATE POLICY "module_thread_messages_select" ON public.module_thread_messages
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.get_client_from_thread(thread_id) = auth.uid()
  OR public.has_active_coach_access_to_client(auth.uid(), public.get_client_from_thread(thread_id))
);

-- INSERT: Client can post in their threads; ONLY module owner coach can reply
CREATE POLICY "module_thread_messages_insert" ON public.module_thread_messages
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    author_user_id = auth.uid()
    AND (
      -- Client can post in their own threads
      (author_role = 'client' AND public.get_client_from_thread(thread_id) = auth.uid())
      OR
      -- ONLY module owner coach can post (not primary coach unless they own the module)
      (author_role = 'coach' AND public.get_module_owner_from_thread(thread_id) = auth.uid())
    )
  )
);

-- UPDATE: Only author or admin
CREATE POLICY "module_thread_messages_update" ON public.module_thread_messages
FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR author_user_id = auth.uid()
);

-- DELETE: Admin only
CREATE POLICY "module_thread_messages_delete" ON public.module_thread_messages
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));