-- Function to auto-create modules for add-on coaches in future program days
-- This is called when a care team assignment is created or becomes active
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

-- Trigger to auto-create modules when care team assignment is added
DROP TRIGGER IF EXISTS trg_auto_create_addon_modules ON care_team_assignments;
CREATE TRIGGER trg_auto_create_addon_modules
  AFTER INSERT ON care_team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_addon_modules();

-- Function to stop generating modules after active_until date
-- This modifies the assign program logic to respect active_until
CREATE OR REPLACE FUNCTION public.should_create_module_for_specialist(
  p_staff_user_id uuid,
  p_subscription_id uuid,
  p_day_date date
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM care_team_assignments
    WHERE staff_user_id = p_staff_user_id
      AND subscription_id = p_subscription_id
      AND lifecycle_status IN ('active', 'scheduled_end')
      AND active_from <= p_day_date
      AND (active_until IS NULL OR active_until >= p_day_date)
  )
$function$;

-- Function to get all active care team members for a subscription on a given date
CREATE OR REPLACE FUNCTION public.get_active_care_team_for_date(
  p_subscription_id uuid,
  p_day_date date
)
RETURNS TABLE(
  staff_user_id uuid,
  specialty text,
  module_type text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT 
    cta.staff_user_id,
    cta.specialty::text,
    cta.specialty::text as module_type
  FROM care_team_assignments cta
  WHERE cta.subscription_id = p_subscription_id
    AND cta.lifecycle_status IN ('active', 'scheduled_end')
    AND cta.active_from <= p_day_date
    AND (cta.active_until IS NULL OR cta.active_until >= p_day_date)
$function$;