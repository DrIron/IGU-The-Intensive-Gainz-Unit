-- Second care-team blocker (scoped-B, Hasan 2026-07-05): auto_create_addon_modules() creates a
-- workout client_day_modules row owned by the new care-team specialist, and
-- client_day_modules.module_owner_coach_id FKs coaches(user_id). A pure dietitian isn't in coaches,
-- so the trigger blocked dietitian care-team assignment even after the legacy-FK fix.
--
-- Fix: skip module creation for the nutrition specialties (nutrition, dietitian). Rationale:
--   (1) can't gate on is_billable/addon_id -- link_addon_to_care_team sets those on a LATER
--       subscription_addons insert, so they're false/null when this trigger fires;
--   (2) nutrition roles work in the Nutrition section, so "Nutrition/Dietitian Session" workout
--       day-modules are product-noise regardless of the FK;
--   (3) skipping BOTH nutrition specialties (not just dietitian) keeps it consistent.
-- The coaches FK on client_day_modules.module_owner_coach_id is intentionally left intact.
--
-- S6 flag: pure physiotherapy/mobility specialists legitimately produce session-modules but won't
-- be in coaches either -> they will trip the same FK. Repoint client_day_modules.module_owner_coach_id
-- to profiles_public when those roles are actually provisioned.

CREATE OR REPLACE FUNCTION public.auto_create_addon_modules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_program record;
  v_program_day record;
  v_existing_module_count int;
  v_max_sort_order int;
  v_module_type text;
BEGIN
  -- Only trigger for new active assignments
  IF NEW.lifecycle_status NOT IN ('active', 'scheduled_end') THEN
    RETURN NEW;
  END IF;

  -- Nutrition specialists work in the Nutrition section, not the workout program. Don't create
  -- "{specialty} Session" workout day-modules for them (product-noise), and a pure dietitian isn't
  -- in coaches, which module_owner_coach_id FKs. Skip these specialties entirely.
  IF NEW.specialty::text IN ('nutrition', 'dietitian') THEN
    RETURN NEW;
  END IF;

  -- Map specialty to module type
  v_module_type := NEW.specialty::text;

  -- Find the active client program for this subscription
  SELECT cp.* INTO v_client_program
  FROM client_programs cp
  WHERE cp.subscription_id = NEW.subscription_id
    AND cp.status = 'active'
  ORDER BY cp.start_date DESC
  LIMIT 1;

  -- No active program, nothing to do
  IF v_client_program IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create modules for future program days (date >= today)
  FOR v_program_day IN
    SELECT cpd.*
    FROM client_program_days cpd
    WHERE cpd.client_program_id = v_client_program.id
      AND cpd.date >= CURRENT_DATE
    ORDER BY cpd.date
  LOOP
    -- Check if a module of this type already exists for this day
    SELECT COUNT(*) INTO v_existing_module_count
    FROM client_day_modules
    WHERE client_program_day_id = v_program_day.id
      AND module_owner_coach_id = NEW.staff_user_id
      AND module_type = v_module_type;

    IF v_existing_module_count = 0 THEN
      -- Get max sort order for the day
      SELECT COALESCE(MAX(sort_order), 0) INTO v_max_sort_order
      FROM client_day_modules
      WHERE client_program_day_id = v_program_day.id;

      -- Create the module for this add-on coach
      INSERT INTO client_day_modules (
        client_program_day_id,
        module_owner_coach_id,
        module_type,
        title,
        sort_order,
        status
      ) VALUES (
        v_program_day.id,
        NEW.staff_user_id,
        v_module_type,
        INITCAP(v_module_type) || ' Session',
        v_max_sort_order + 1,
        'scheduled'
      );
    END IF;
  END LOOP;

  -- Log the auto-creation
  INSERT INTO admin_audit_log (
    admin_user_id, action_type, target_type, target_id, details
  ) VALUES (
    COALESCE(NEW.added_by, '00000000-0000-0000-0000-000000000000'::uuid),
    'auto_create_addon_modules',
    'care_team_assignment',
    NEW.id,
    jsonb_build_object(
      'staff_user_id', NEW.staff_user_id,
      'client_id', NEW.client_id,
      'specialty', NEW.specialty,
      'subscription_id', NEW.subscription_id
    )
  );

  RETURN NEW;
END;
$function$;
