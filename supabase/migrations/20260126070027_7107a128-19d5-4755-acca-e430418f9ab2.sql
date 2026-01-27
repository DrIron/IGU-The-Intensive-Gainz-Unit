-- Trigger function to manage coach_client_relationships on subscription changes
CREATE OR REPLACE FUNCTION public.manage_coach_client_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- CASE 1: New subscription with coach assigned
  IF TG_OP = 'INSERT' THEN
    IF NEW.coach_id IS NOT NULL THEN
      INSERT INTO public.coach_client_relationships (
        client_id, coach_id, subscription_id, role, started_at
      ) VALUES (
        NEW.user_id, NEW.coach_id, NEW.id, 'primary', v_now
      );
    END IF;
    RETURN NEW;
  END IF;

  -- CASE 2: Subscription update
  IF TG_OP = 'UPDATE' THEN
    -- 2a: Coach reassignment (coach_id changed)
    IF OLD.coach_id IS DISTINCT FROM NEW.coach_id THEN
      -- End previous primary relationship for this subscription
      IF OLD.coach_id IS NOT NULL THEN
        UPDATE public.coach_client_relationships
        SET ended_at = v_now, updated_at = v_now
        WHERE subscription_id = NEW.id
          AND coach_id = OLD.coach_id
          AND role = 'primary'
          AND ended_at IS NULL;
      END IF;
      
      -- Create new primary relationship if new coach assigned
      IF NEW.coach_id IS NOT NULL THEN
        INSERT INTO public.coach_client_relationships (
          client_id, coach_id, subscription_id, role, started_at
        ) VALUES (
          NEW.user_id, NEW.coach_id, NEW.id, 'primary', v_now
        );
      END IF;
    END IF;

    -- 2b: Subscription ended (status changed to inactive/cancelled/expired)
    IF OLD.status NOT IN ('inactive', 'cancelled', 'expired') 
       AND NEW.status IN ('inactive', 'cancelled', 'expired') THEN
      -- End ALL active relationships for this subscription (primary + care_team)
      UPDATE public.coach_client_relationships
      SET ended_at = v_now, updated_at = v_now
      WHERE subscription_id = NEW.id
        AND ended_at IS NULL;
    END IF;

    -- 2c: Subscription reactivated (from ended state back to active/pending)
    -- Create new relationship if coach assigned and no active one exists
    IF OLD.status IN ('inactive', 'cancelled', 'expired')
       AND NEW.status IN ('active', 'pending', 'pending_payment')
       AND NEW.coach_id IS NOT NULL THEN
      -- Only insert if no active relationship exists
      IF NOT EXISTS (
        SELECT 1 FROM public.coach_client_relationships
        WHERE subscription_id = NEW.id
          AND coach_id = NEW.coach_id
          AND role = 'primary'
          AND ended_at IS NULL
      ) THEN
        INSERT INTO public.coach_client_relationships (
          client_id, coach_id, subscription_id, role, started_at
        ) VALUES (
          NEW.user_id, NEW.coach_id, NEW.id, 'primary', v_now
        );
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_manage_coach_client_relationships ON public.subscriptions;
CREATE TRIGGER trg_manage_coach_client_relationships
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.manage_coach_client_relationships();

-- Also handle care_team_assignments changes
CREATE OR REPLACE FUNCTION public.manage_care_team_relationships()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- New care team assignment
  IF TG_OP = 'INSERT' AND NEW.status = 'active' THEN
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
    -- Status changed to inactive/removed
    IF OLD.status = 'active' AND NEW.status != 'active' THEN
      UPDATE public.coach_client_relationships
      SET ended_at = COALESCE(NEW.removed_at, v_now), updated_at = v_now
      WHERE subscription_id = NEW.subscription_id
        AND coach_id = NEW.staff_user_id
        AND client_id = NEW.client_id
        AND role = 'care_team'
        AND ended_at IS NULL;
    END IF;
    
    -- Status changed back to active
    IF OLD.status != 'active' AND NEW.status = 'active' THEN
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
$$;

-- Create the care team trigger
DROP TRIGGER IF EXISTS trg_manage_care_team_relationships ON public.care_team_assignments;
CREATE TRIGGER trg_manage_care_team_relationships
  AFTER INSERT OR UPDATE OR DELETE ON public.care_team_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.manage_care_team_relationships();

-- Add comment for documentation
COMMENT ON FUNCTION public.manage_coach_client_relationships() IS 
  'Automatically manages coach_client_relationships when subscriptions are created, coaches are reassigned, or subscriptions end.';

COMMENT ON FUNCTION public.manage_care_team_relationships() IS 
  'Automatically manages coach_client_relationships for care_team role when care_team_assignments change.';