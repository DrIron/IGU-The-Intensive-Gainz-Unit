-- ============================================================
-- Atomic macrocycle block reorder/remove.
--
-- The naive client-side pattern of DELETE-ALL + INSERT-ALL is split
-- across two PostgREST round-trips. If the INSERT fails after the
-- DELETE succeeds, the macrocycle is permanently emptied. This RPC
-- runs both in a single SQL transaction so a partial failure rolls
-- back cleanly and the macrocycle never ends up empty.
--
-- Accepts the full ordered list of program_template_ids for the
-- macrocycle; any existing junction rows are replaced.
-- ============================================================

CREATE OR REPLACE FUNCTION public.reorder_macrocycle_blocks(
  p_macrocycle_id UUID,
  p_program_template_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id UUID;
  v_count INT;
BEGIN
  -- Gate on macrocycle ownership. SECURITY DEFINER bypasses RLS, so we
  -- enforce coach/admin access explicitly.
  SELECT coach_id INTO v_coach_id
  FROM macrocycles
  WHERE id = p_macrocycle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Macrocycle not found: %', p_macrocycle_id;
  END IF;

  IF v_coach_id <> auth.uid() AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to edit macrocycle %', p_macrocycle_id;
  END IF;

  -- Atomic replace: DELETE + INSERT inside one txn.
  DELETE FROM macrocycle_mesocycles
  WHERE macrocycle_id = p_macrocycle_id;

  v_count := COALESCE(array_length(p_program_template_ids, 1), 0);

  IF v_count > 0 THEN
    INSERT INTO macrocycle_mesocycles (macrocycle_id, program_template_id, sequence)
    SELECT p_macrocycle_id, tid, seq - 1
    FROM unnest(p_program_template_ids) WITH ORDINALITY AS t(tid, seq);
  END IF;

  -- Bump macrocycle.updated_at so the list view shows the change.
  UPDATE macrocycles SET updated_at = now() WHERE id = p_macrocycle_id;

  RETURN jsonb_build_object('count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reorder_macrocycle_blocks TO authenticated;
