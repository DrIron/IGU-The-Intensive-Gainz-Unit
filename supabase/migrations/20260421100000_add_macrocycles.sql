-- ============================================================
-- Macrocycles — ordered collections of mesocycle programs.
--
-- A macrocycle is a coach-owned artifact (3-6 month training arc)
-- composed of existing program_templates (= mesocycles) in order.
-- Assigning a macrocycle to a client fans out to N client_programs
-- rows with staggered start_dates; client-side views remain unchanged.
-- ============================================================

-- 1. Macrocycle container
CREATE TABLE IF NOT EXISTS public.macrocycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coaches(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_macrocycles_coach_id ON public.macrocycles(coach_id);

-- 2. Junction: ordered mesocycles inside a macrocycle.
-- Primary key on (macrocycle_id, program_template_id) prevents a mesocycle
-- from appearing twice inside the SAME macrocycle. Reuse across different
-- macrocycles is still allowed.
-- UNIQUE(macrocycle_id, sequence) enforces contiguous ordering.
CREATE TABLE IF NOT EXISTS public.macrocycle_mesocycles (
  macrocycle_id UUID NOT NULL REFERENCES public.macrocycles(id) ON DELETE CASCADE,
  program_template_id UUID NOT NULL REFERENCES public.program_templates(id) ON DELETE CASCADE,
  sequence INT NOT NULL,
  PRIMARY KEY (macrocycle_id, program_template_id),
  UNIQUE (macrocycle_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_macrocycle_mesocycles_macrocycle_id
  ON public.macrocycle_mesocycles(macrocycle_id);
CREATE INDEX IF NOT EXISTS idx_macrocycle_mesocycles_program_template_id
  ON public.macrocycle_mesocycles(program_template_id);

-- 3. Link client assignments back to the macrocycle for grouping/reporting.
-- ON DELETE SET NULL so deleting a macrocycle does NOT nuke live client
-- assignments — the instances remain, just lose the grouping label.
ALTER TABLE public.client_programs
  ADD COLUMN IF NOT EXISTS macrocycle_id UUID
    REFERENCES public.macrocycles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_programs_macrocycle_id
  ON public.client_programs(macrocycle_id)
  WHERE macrocycle_id IS NOT NULL;

-- 4. RLS — same shape as program_templates.
ALTER TABLE public.macrocycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macrocycle_mesocycles ENABLE ROW LEVEL SECURITY;

-- Coach reads/writes own macrocycles
CREATE POLICY "coaches can read own macrocycles"
  ON public.macrocycles FOR SELECT
  USING (coach_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "coaches can insert own macrocycles"
  ON public.macrocycles FOR INSERT
  WITH CHECK (coach_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "coaches can update own macrocycles"
  ON public.macrocycles FOR UPDATE
  USING (coach_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "coaches can delete own macrocycles"
  ON public.macrocycles FOR DELETE
  USING (coach_id = auth.uid() OR public.is_admin(auth.uid()));

-- Clients can read macrocycles they've been assigned to — lets future
-- client UI label "You're on Macrocycle X, week 5 of 12".
CREATE POLICY "clients can read assigned macrocycles"
  ON public.macrocycles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_programs cp
      WHERE cp.user_id = auth.uid()
        AND cp.macrocycle_id = macrocycles.id
    )
  );

-- Junction table: coaches manage their own; admins all.
CREATE POLICY "coaches can read own macrocycle_mesocycles"
  ON public.macrocycle_mesocycles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.macrocycles m
      WHERE m.id = macrocycle_mesocycles.macrocycle_id
        AND (m.coach_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "coaches can insert own macrocycle_mesocycles"
  ON public.macrocycle_mesocycles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.macrocycles m
      WHERE m.id = macrocycle_mesocycles.macrocycle_id
        AND (m.coach_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "coaches can update own macrocycle_mesocycles"
  ON public.macrocycle_mesocycles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.macrocycles m
      WHERE m.id = macrocycle_mesocycles.macrocycle_id
        AND (m.coach_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

CREATE POLICY "coaches can delete own macrocycle_mesocycles"
  ON public.macrocycle_mesocycles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.macrocycles m
      WHERE m.id = macrocycle_mesocycles.macrocycle_id
        AND (m.coach_id = auth.uid() OR public.is_admin(auth.uid()))
    )
  );

-- 5. Extend assign_program_to_client to accept optional macrocycle_id
-- so the macrocycle RPC can stamp the link on each fanned-out client_program.
-- CREATE OR REPLACE only matches an existing function by identical parameter
-- list — adding a new parameter (even with DEFAULT) creates an overload
-- instead, causing ambiguity on GRANT. Drop the prior 6-arg signature first.
DROP FUNCTION IF EXISTS public.assign_program_to_client(
  UUID, UUID, UUID, UUID, DATE, UUID
);

CREATE OR REPLACE FUNCTION public.assign_program_to_client(
  p_coach_id UUID,
  p_client_id UUID,
  p_subscription_id UUID,
  p_template_id UUID,
  p_start_date DATE,
  p_team_id UUID DEFAULT NULL,
  p_macrocycle_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_program_id UUID;
  v_template RECORD;
  v_day RECORD;
  v_client_day_id UUID;
  v_day_date DATE;
  v_module RECORD;
  v_client_module_id UUID;
  v_exercise RECORD;
  v_prescription RECORD;
  v_care_member RECORD;
  v_max_sort_order INT;
  v_existing_module_count INT;
  v_total_days INT := 0;
  v_total_modules INT := 0;
  v_total_exercises INT := 0;
BEGIN
  SELECT id, title INTO v_template
  FROM program_templates
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program template not found: %', p_template_id;
  END IF;

  INSERT INTO client_programs (
    user_id, subscription_id, primary_coach_id, source_template_id,
    start_date, status, team_id, macrocycle_id
  ) VALUES (
    p_client_id, p_subscription_id, p_coach_id, p_template_id,
    p_start_date, 'active', p_team_id, p_macrocycle_id
  )
  RETURNING id INTO v_client_program_id;

  FOR v_day IN
    SELECT id, day_index, day_title
    FROM program_template_days
    WHERE program_template_id = p_template_id
    ORDER BY day_index
  LOOP
    v_day_date := p_start_date + (v_day.day_index - 1);
    v_max_sort_order := 0;

    INSERT INTO client_program_days (
      client_program_id, day_index, title, date
    ) VALUES (
      v_client_program_id, v_day.day_index, v_day.day_title, v_day_date
    )
    RETURNING id INTO v_client_day_id;

    v_total_days := v_total_days + 1;

    FOR v_module IN
      SELECT *
      FROM day_modules
      WHERE program_template_day_id = v_day.id
        AND status = 'published'
      ORDER BY sort_order
    LOOP
      INSERT INTO client_day_modules (
        client_program_day_id, source_day_module_id, module_owner_coach_id,
        module_type, session_type, session_timing, title, sort_order, status
      ) VALUES (
        v_client_day_id, v_module.id, v_module.module_owner_coach_id,
        v_module.module_type, v_module.session_type, v_module.session_timing,
        v_module.title, v_module.sort_order, 'scheduled'
      )
      RETURNING id INTO v_client_module_id;

      v_total_modules := v_total_modules + 1;
      v_max_sort_order := GREATEST(v_max_sort_order, v_module.sort_order);

      FOR v_exercise IN
        SELECT me.*
        FROM module_exercises me
        WHERE me.day_module_id = v_module.id
        ORDER BY me.sort_order
      LOOP
        SELECT * INTO v_prescription
        FROM exercise_prescriptions
        WHERE module_exercise_id = v_exercise.id
        LIMIT 1;

        INSERT INTO client_module_exercises (
          client_day_module_id, exercise_id, section, sort_order,
          instructions, prescription_snapshot_json
        ) VALUES (
          v_client_module_id, v_exercise.exercise_id, v_exercise.section,
          v_exercise.sort_order, v_exercise.instructions,
          CASE WHEN v_prescription.id IS NOT NULL THEN
            jsonb_build_object(
              'set_count', v_prescription.set_count,
              'rep_range_min', v_prescription.rep_range_min,
              'rep_range_max', v_prescription.rep_range_max,
              'tempo', v_prescription.tempo,
              'rest_seconds', v_prescription.rest_seconds,
              'intensity_type', v_prescription.intensity_type,
              'intensity_value', v_prescription.intensity_value,
              'warmup_sets_json', v_prescription.warmup_sets_json,
              'custom_fields_json', v_prescription.custom_fields_json,
              'progression_notes', v_prescription.progression_notes,
              'sets_json', COALESCE(v_prescription.sets_json, 'null'::jsonb),
              'column_config', COALESCE(v_prescription.column_config, '[]'::jsonb),
              'linear_progression_enabled', COALESCE(v_prescription.linear_progression_enabled, false),
              'progression_config', COALESCE(v_prescription.progression_config, 'null'::jsonb)
            )
          ELSE '{}'::jsonb
          END
        );

        v_total_exercises := v_total_exercises + 1;
      END LOOP;

      INSERT INTO module_threads (client_day_module_id)
      VALUES (v_client_module_id);
    END LOOP;

    FOR v_care_member IN
      SELECT staff_user_id, specialty
      FROM care_team_assignments
      WHERE subscription_id = p_subscription_id
        AND lifecycle_status IN ('active', 'scheduled_end')
        AND active_from <= v_day_date
        AND (active_until IS NULL OR active_until >= v_day_date)
    LOOP
      SELECT COUNT(*) INTO v_existing_module_count
      FROM day_modules
      WHERE program_template_day_id = v_day.id
        AND status = 'published'
        AND module_owner_coach_id = v_care_member.staff_user_id
        AND module_type = v_care_member.specialty;

      IF v_existing_module_count = 0 THEN
        v_max_sort_order := v_max_sort_order + 1;

        INSERT INTO client_day_modules (
          client_program_day_id, module_owner_coach_id, module_type,
          title, sort_order, status
        ) VALUES (
          v_client_day_id, v_care_member.staff_user_id, v_care_member.specialty,
          initcap(v_care_member.specialty) || ' Session',
          v_max_sort_order, 'scheduled'
        );

        v_total_modules := v_total_modules + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'client_program_id', v_client_program_id,
    'total_days', v_total_days,
    'total_modules', v_total_modules,
    'total_exercises', v_total_exercises
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_program_to_client TO authenticated;

-- 6. Macrocycle fan-out RPC.
-- Iterates ordered mesocycles, computes staggered start_dates from cumulative
-- week counts (ceil(MAX(day_index)/7) per mesocycle), and calls the per-
-- program assignment RPC for each. Runs in a single transaction — if any
-- child fails the whole thing rolls back.
CREATE OR REPLACE FUNCTION public.assign_macrocycle_to_client(
  p_coach_id UUID,
  p_client_id UUID,
  p_subscription_id UUID,
  p_macrocycle_id UUID,
  p_start_date DATE,
  p_team_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meso RECORD;
  v_weeks INT;
  v_cumulative_weeks INT := 0;
  v_this_start DATE;
  v_child_result JSONB;
  v_client_program_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM macrocycles WHERE id = p_macrocycle_id) THEN
    RAISE EXCEPTION 'Macrocycle not found: %', p_macrocycle_id;
  END IF;

  FOR v_meso IN
    SELECT mm.program_template_id, mm.sequence
    FROM macrocycle_mesocycles mm
    WHERE mm.macrocycle_id = p_macrocycle_id
    ORDER BY mm.sequence
  LOOP
    -- Compute week count for this mesocycle.
    -- program_template_days.day_index is 1-indexed absolute
    -- (W1 = 1-7, W2 = 8-14, etc.) so ceil(MAX/7) gives week count.
    SELECT COALESCE(CEIL(MAX(day_index)::numeric / 7), 1)::int
    INTO v_weeks
    FROM program_template_days
    WHERE program_template_id = v_meso.program_template_id;

    v_this_start := p_start_date + (v_cumulative_weeks * 7);

    v_child_result := assign_program_to_client(
      p_coach_id, p_client_id, p_subscription_id,
      v_meso.program_template_id, v_this_start,
      p_team_id, p_macrocycle_id
    );

    v_client_program_ids := v_client_program_ids
      || ((v_child_result->>'client_program_id')::UUID);
    v_cumulative_weeks := v_cumulative_weeks + v_weeks;
  END LOOP;

  RETURN jsonb_build_object(
    'client_program_ids', to_jsonb(v_client_program_ids),
    'weeks_total', v_cumulative_weeks
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_macrocycle_to_client TO authenticated;
