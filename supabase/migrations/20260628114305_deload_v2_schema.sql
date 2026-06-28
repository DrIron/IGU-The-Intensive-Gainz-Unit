-- Deload v2 — schema slice. See docs/DELOAD_V2.md.
-- Authored deload weeks gain a placement mode; on-demand deloads are spliced into a
-- client's running week sequence (insert + shift) rather than substituted in place +
-- coach-approved. ADDITIVE — supersedes deloadAutoApply's on-demand path (later slice).

-- 1. plan_weeks.deload_placement — only meaningful when is_deload = true.
--    'pinned'    = runs in place at its week_index (today's behavior).
--    'on_demand' = excluded from the running sequence; insertable on demand.
ALTER TABLE public.plan_weeks
  ADD COLUMN IF NOT EXISTS deload_placement text
    CHECK (deload_placement IS NULL OR deload_placement IN ('pinned', 'on_demand'));

-- 2. client_plan_inserted_deloads — one row per on-demand deload a client/coach has
--    spliced into a specific assignment's week sequence.
CREATE TABLE IF NOT EXISTS public.client_plan_inserted_deloads (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id       uuid NOT NULL REFERENCES public.client_plan_assignment (id) ON DELETE CASCADE,
  position_week_index int  NOT NULL CHECK (position_week_index >= 1),
  source_plan_week_id uuid NOT NULL REFERENCES public.plan_weeks (id) ON DELETE CASCADE,
  preset_id           text,
  inserted_by         uuid NOT NULL DEFAULT auth.uid(),
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cpid_assignment ON public.client_plan_inserted_deloads (assignment_id);

ALTER TABLE public.client_plan_inserted_deloads ENABLE ROW LEVEL SECURITY;

-- RLS: client-self + active care-team + admin. is_care_team_member_for_client folds in
-- admin + primary coach + care team; gated through the parent assignment. Same access
-- shape as coach_client_messages.
CREATE POLICY cpid_via_assignment ON public.client_plan_inserted_deloads
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.client_plan_assignment a
    WHERE a.id = client_plan_inserted_deloads.assignment_id
      AND (a.client_id = auth.uid()
           OR public.is_care_team_member_for_client(auth.uid(), a.client_id))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_plan_assignment a
    WHERE a.id = client_plan_inserted_deloads.assignment_id
      AND (a.client_id = auth.uid()
           OR public.is_care_team_member_for_client(auth.uid(), a.client_id))
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_plan_inserted_deloads TO authenticated;
GRANT ALL ON public.client_plan_inserted_deloads TO service_role;

-- 3. RPCs — insert/remove an on-demand deload for an assignment. SECURITY DEFINER;
--    in-function auth.uid() + client-self/care-team check is defense-in-depth.
CREATE OR REPLACE FUNCTION public.insert_client_deload(
  p_assignment_id       uuid,
  p_position_week_index int,
  p_source_plan_week_id uuid,
  p_preset_id           text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_client    uuid;
  v_plan      uuid;
  v_wk_plan   uuid;
  v_is_deload boolean;
  v_placement text;
  v_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_position_week_index IS NULL OR p_position_week_index < 1 THEN
    RAISE EXCEPTION 'invalid position_week_index %', p_position_week_index USING ERRCODE = '22023';
  END IF;

  SELECT client_id, plan_id INTO v_client, v_plan
  FROM public.client_plan_assignment WHERE id = p_assignment_id;
  IF v_client IS NULL THEN
    RAISE EXCEPTION 'assignment % not found', p_assignment_id USING ERRCODE = '42704';
  END IF;

  -- client-self OR care team (admin + primary coach folded into the care-team check)
  IF v_uid <> v_client AND NOT public.is_care_team_member_for_client(v_uid, v_client) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  -- the source week must be an on-demand deload week in the assignment's followed plan
  SELECT plan_id, is_deload, deload_placement
    INTO v_wk_plan, v_is_deload, v_placement
  FROM public.plan_weeks WHERE id = p_source_plan_week_id;
  IF v_wk_plan IS NULL OR v_wk_plan <> v_plan THEN
    RAISE EXCEPTION 'source week % not in assignment plan', p_source_plan_week_id USING ERRCODE = '22023';
  END IF;
  IF NOT v_is_deload OR v_placement IS DISTINCT FROM 'on_demand' THEN
    RAISE EXCEPTION 'source week % is not an on-demand deload', p_source_plan_week_id USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.client_plan_inserted_deloads
    (assignment_id, position_week_index, source_plan_week_id, preset_id, inserted_by)
  VALUES (p_assignment_id, p_position_week_index, p_source_plan_week_id, p_preset_id, v_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('action', 'inserted', 'id', v_id, 'position_week_index', p_position_week_index);
END;
$function$;

CREATE OR REPLACE FUNCTION public.remove_client_deload(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_client uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT a.client_id INTO v_client
  FROM public.client_plan_inserted_deloads d
  JOIN public.client_plan_assignment a ON a.id = d.assignment_id
  WHERE d.id = p_id;

  IF v_client IS NULL THEN
    RETURN jsonb_build_object('action', 'noop');
  END IF;

  IF v_uid <> v_client AND NOT public.is_care_team_member_for_client(v_uid, v_client) THEN
    RAISE EXCEPTION 'Not authorised' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.client_plan_inserted_deloads WHERE id = p_id;
  RETURN jsonb_build_object('action', 'removed', 'id', p_id);
END;
$function$;

-- Scope RPCs to authenticated callers. CLAUDE.md "SECURITY DEFINER RPCs -- mandatory REVOKE pattern".
REVOKE ALL ON FUNCTION public.insert_client_deload(uuid, int, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.insert_client_deload(uuid, int, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.insert_client_deload(uuid, int, uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_client_deload(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_client_deload(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.remove_client_deload(uuid) TO authenticated;
