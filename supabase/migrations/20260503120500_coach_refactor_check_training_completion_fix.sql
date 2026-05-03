-- Phase 1A migration 5b/6 — Coach column-ownership refactor
-- Removes the redundant `UPDATE coaches_public SET status = 'active'`
-- line from check_training_completion(). The duplicated write was one
-- of the original drift sources between `coaches.status` and
-- `coaches_public.status`. Going forward, `coaches.status` is the
-- canonical home (Phase 3 migration 7 drops `coaches_public.status`).
--
-- ───────────────────────────────────────────────────────────────────
-- STALE-READ WINDOW
-- After this migration ships, `coaches_public.status` is no longer
-- updated when a coach completes training. Phase 0c identified one
-- read site that still queries it: AdminBillingManager.tsx:370.
-- That page renders stale `'training'` status for any coach who
-- completes training between this migration and 1C ship.
--
-- Acceptance criteria for shipping 1A: Hasan confirmed only 1 prod
-- coach is past training, target same-day 1A → 1B → 1C ship. The
-- only way the stale read is observable is if a NEW coach completes
-- training during the same-day window. AdminBillingManager:370 fix
-- ships in 1C.
-- ───────────────────────────────────────────────────────────────────
--
-- Idempotent: CREATE OR REPLACE; safe to re-run.

CREATE OR REPLACE FUNCTION public.check_training_completion(p_coach_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_required_count INTEGER;
  v_completed_count INTEGER;
  v_all_complete BOOLEAN;
BEGIN
  -- Count required active content
  SELECT COUNT(*)
  INTO v_required_count
  FROM coach_educational_content
  WHERE is_required = true AND is_active = true;

  -- Count completed required content for this coach
  SELECT COUNT(*)
  INTO v_completed_count
  FROM coach_content_completions cc
  JOIN coach_educational_content ce ON ce.id = cc.content_id
  WHERE cc.coach_user_id = p_coach_user_id
    AND ce.is_required = true
    AND ce.is_active = true;

  v_all_complete := (v_completed_count >= v_required_count AND v_required_count > 0);

  -- If all required content is complete, auto-transition to active.
  -- Status canonical home is `coaches`. The redundant
  -- `UPDATE coaches_public SET status` line was removed as part of
  -- the column-ownership refactor (Phase 1A). Reads of
  -- coaches_public.status get a stale-read window until 1C ships
  -- (only AdminBillingManager.tsx:370 — see migration header).
  IF v_all_complete THEN
    UPDATE coaches SET status = 'active'
    WHERE user_id = p_coach_user_id AND status = 'training';
  END IF;

  RETURN jsonb_build_object(
    'required_count',  v_required_count,
    'completed_count', v_completed_count,
    'all_complete',    v_all_complete
  );
END;
$function$;
