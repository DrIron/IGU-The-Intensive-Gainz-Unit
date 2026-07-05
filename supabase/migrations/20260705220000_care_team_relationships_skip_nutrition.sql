-- Third care-team blocker (same root cause as the module trigger; scoped-B extended). After the
-- legacy-FK fix and the auto_create_addon_modules skip, a dietitian care-team insert still tripped
-- manage_care_team_relationships(): it mirrors the assignment into coach_client_relationships with
-- coach_id = staff_user_id, and coach_client_relationships.coach_id FKs coaches(user_id). A pure
-- dietitian isn't in coaches -> blocked.
--
-- coach_client_relationships is a COACH relationship table. Evidence it's not needed for a dietitian:
--   * dietitian access flows entirely through care_team_assignments -- is_care_team_member_for_client,
--     is_dietitian_for_client, and can_edit_nutrition all query care_team_assignments, not this table;
--   * no RLS policy references coach_client_relationships; no app code reads it;
--   * the functions that do read it (is_active_coach_for_client, get_coach_client_tenure,
--     was_coach_during_record, has_active_coach_relationship) are coach-specific -- a dietitian
--     correctly should NOT appear as a coach relationship.
-- So skip the coach_client_relationships mirror for the nutrition specialties (nutrition, dietitian),
-- consistent with the auto_create_addon_modules skip. The coaches FK is left intact.
--
-- S6 flag (same as the module trigger): pure physiotherapy/mobility specialists legitimately need a
-- relationship/session record but won't be in coaches -> repoint coach_client_relationships.coach_id
-- (and client_day_modules.module_owner_coach_id) to profiles_public when those roles are provisioned.

CREATE OR REPLACE FUNCTION public.manage_care_team_relationships()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_specialty text := CASE WHEN TG_OP = 'DELETE' THEN OLD.specialty::text ELSE NEW.specialty::text END;
BEGIN
  -- Nutrition specialists (nutrition, dietitian) don't get a coach_client_relationships mirror --
  -- their care-team access is via care_team_assignments, and coach_id here FKs coaches (which a
  -- pure dietitian isn't in). Skip; return the right tuple for the op.
  IF v_specialty IN ('nutrition', 'dietitian') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- New care team assignment
  IF TG_OP = 'INSERT' AND NEW.lifecycle_status IN ('active', 'scheduled_end') THEN
    INSERT INTO public.coach_client_relationships (
      client_id, coach_id, subscription_id, role, started_at
    ) VALUES (
      NEW.client_id, NEW.staff_user_id, NEW.subscription_id, 'care_team', v_now
    )
    ON CONFLICT DO NOTHING; -- Avoid duplicates
    RETURN NEW;
  END IF;

  -- Care team member removed/deactivated
  IF TG_OP = 'UPDATE' THEN
    -- Lifecycle changed out of the active window (-> terminated_for_cause / ended)
    IF OLD.lifecycle_status IN ('active', 'scheduled_end')
       AND NEW.lifecycle_status NOT IN ('active', 'scheduled_end') THEN
      UPDATE public.coach_client_relationships
      SET ended_at = COALESCE(NEW.removed_at, v_now), updated_at = v_now
      WHERE subscription_id = NEW.subscription_id
        AND coach_id = NEW.staff_user_id
        AND client_id = NEW.client_id
        AND role = 'care_team'
        AND ended_at IS NULL;
    END IF;

    -- Lifecycle changed back into the active window
    IF OLD.lifecycle_status NOT IN ('active', 'scheduled_end')
       AND NEW.lifecycle_status IN ('active', 'scheduled_end') THEN
      -- Only insert if no active relationship exists
      IF NOT EXISTS (
        SELECT 1 FROM public.coach_client_relationships
        WHERE subscription_id = NEW.subscription_id
          AND coach_id = NEW.staff_user_id
          AND client_id = NEW.client_id
          AND role = 'care_team'
          AND ended_at IS NULL
      ) THEN
        INSERT INTO public.coach_client_relationships (
          client_id, coach_id, subscription_id, role, started_at
        ) VALUES (
          NEW.client_id, NEW.staff_user_id, NEW.subscription_id, 'care_team', v_now
        );
      END IF;
    END IF;
  END IF;

  -- Care team deletion
  IF TG_OP = 'DELETE' THEN
    UPDATE public.coach_client_relationships
    SET ended_at = v_now, updated_at = v_now
    WHERE subscription_id = OLD.subscription_id
      AND coach_id = OLD.staff_user_id
      AND client_id = OLD.client_id
      AND role = 'care_team'
      AND ended_at IS NULL;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;
