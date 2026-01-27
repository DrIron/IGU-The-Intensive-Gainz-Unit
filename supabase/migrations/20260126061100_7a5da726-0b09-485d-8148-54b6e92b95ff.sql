-- Add verification tracking columns to subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS last_verified_charge_id text,
ADD COLUMN IF NOT EXISTS last_payment_verified_at timestamptz,
ADD COLUMN IF NOT EXISTS last_payment_status text;

-- Create function to validate subscription activation
CREATE OR REPLACE FUNCTION public.validate_subscription_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only check when transitioning TO 'active' status
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    -- Require verified payment for activation
    IF NEW.last_verified_charge_id IS NULL THEN
      RAISE EXCEPTION 'Cannot activate subscription without verified charge ID. Use verify-payment flow.';
    END IF;
    
    IF NEW.last_payment_verified_at IS NULL THEN
      RAISE EXCEPTION 'Cannot activate subscription without payment verification timestamp.';
    END IF;
    
    IF NEW.last_payment_status != 'CAPTURED' THEN
      RAISE EXCEPTION 'Cannot activate subscription without CAPTURED payment status. Current: %', COALESCE(NEW.last_payment_status, 'NULL');
    END IF;
    
    -- Ensure tap_charge_id matches the verified charge
    IF NEW.tap_charge_id IS NOT NULL AND NEW.tap_charge_id != NEW.last_verified_charge_id THEN
      RAISE EXCEPTION 'tap_charge_id (%) does not match last_verified_charge_id (%)', 
        NEW.tap_charge_id, NEW.last_verified_charge_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for subscription activation validation
DROP TRIGGER IF EXISTS trg_validate_subscription_activation ON public.subscriptions;
CREATE TRIGGER trg_validate_subscription_activation
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_subscription_activation();

-- Allow bypass for admin manual overrides via a flag column
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS activation_override_by uuid REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS activation_override_reason text;

-- Update the validation function to allow admin overrides
CREATE OR REPLACE FUNCTION public.validate_subscription_activation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only check when transitioning TO 'active' status
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    -- Allow admin override (must set both override_by and reason)
    IF NEW.activation_override_by IS NOT NULL AND NEW.activation_override_reason IS NOT NULL THEN
      -- Log the override
      INSERT INTO public.admin_audit_log (
        admin_user_id, action_type, target_type, target_id, details
      ) VALUES (
        NEW.activation_override_by,
        'subscription_activation_override',
        'subscription',
        NEW.id,
        jsonb_build_object(
          'reason', NEW.activation_override_reason,
          'previous_status', OLD.status,
          'bypassed_verification', true
        )
      );
      RETURN NEW;
    END IF;
    
    -- Require verified payment for activation
    IF NEW.last_verified_charge_id IS NULL THEN
      RAISE EXCEPTION 'Cannot activate subscription without verified charge ID. Use verify-payment flow or admin override.';
    END IF;
    
    IF NEW.last_payment_verified_at IS NULL THEN
      RAISE EXCEPTION 'Cannot activate subscription without payment verification timestamp.';
    END IF;
    
    IF NEW.last_payment_status != 'CAPTURED' THEN
      RAISE EXCEPTION 'Cannot activate subscription without CAPTURED payment status. Current: %', COALESCE(NEW.last_payment_status, 'NULL');
    END IF;
    
    -- Ensure tap_charge_id matches the verified charge
    IF NEW.tap_charge_id IS NOT NULL AND NEW.tap_charge_id != NEW.last_verified_charge_id THEN
      RAISE EXCEPTION 'tap_charge_id (%) does not match last_verified_charge_id (%)', 
        NEW.tap_charge_id, NEW.last_verified_charge_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add index for verified charge lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_last_verified_charge 
  ON public.subscriptions(last_verified_charge_id) 
  WHERE last_verified_charge_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.subscriptions.last_verified_charge_id IS 'Charge ID verified with TAP API. Required for activation.';
COMMENT ON COLUMN public.subscriptions.last_payment_verified_at IS 'Timestamp when payment was verified with TAP API.';
COMMENT ON COLUMN public.subscriptions.last_payment_status IS 'Payment status from TAP API verification (CAPTURED, FAILED, etc).';
COMMENT ON COLUMN public.subscriptions.activation_override_by IS 'Admin user who bypassed payment verification for manual activation.';
COMMENT ON COLUMN public.subscriptions.activation_override_reason IS 'Reason for admin override of payment verification requirement.';
COMMENT ON FUNCTION public.validate_subscription_activation() IS 'Trigger function that enforces payment verification before subscription activation. Admin can bypass with override fields.';