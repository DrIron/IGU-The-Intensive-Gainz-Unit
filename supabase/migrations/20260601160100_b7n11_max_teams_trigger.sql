-- B7-N11: server-side cap of 3 active teams per coach.
-- The only guard today is a client-side MAX_TEAMS check in CreateTeamDialog,
-- bypassable via a direct REST insert. This trigger makes the cap authoritative.
--
-- Universal domain invariant (Hasan's default): NO admin / service-role / NULL
-- auth.uid() bypass -- everyone must soft-delete a team to make room. This is
-- deliberately NOT the identity-gated-trigger pattern (feedback_trigger_auth_uid_null_branch
-- applies to identity gates; a row-count cap is integrity, not identity).
--
-- Soft-delete signal is is_active=false (coach_teams has no deleted_at column),
-- so the cap counts is_active=true rows. Fires on INSERT and on the
-- reactivation UPDATE edge (is_active false->true) so you can't dodge the cap by
-- flipping an archived team back on while already at 3.
CREATE OR REPLACE FUNCTION public.enforce_max_teams_per_coach()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_active_count int;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_active)
     OR (TG_OP = 'UPDATE' AND NEW.is_active AND NOT COALESCE(OLD.is_active, false)) THEN
    SELECT count(*) INTO v_active_count
    FROM public.coach_teams
    WHERE coach_id = NEW.coach_id
      AND is_active = true
      AND id <> NEW.id;            -- exclude self (no-op on INSERT)
    IF v_active_count >= 3 THEN
      RAISE EXCEPTION
        'Coach already owns 3 active teams. Soft-delete one to make room.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER enforce_max_teams_per_coach_trigger
  BEFORE INSERT OR UPDATE ON public.coach_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_max_teams_per_coach();
