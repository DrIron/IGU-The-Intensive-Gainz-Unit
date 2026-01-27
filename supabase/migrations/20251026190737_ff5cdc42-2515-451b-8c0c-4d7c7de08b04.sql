-- Add payment failure tracking to subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS payment_failed_at timestamp with time zone;

-- Create function to check and deactivate accounts after 1 week of payment failure
CREATE OR REPLACE FUNCTION public.check_failed_payments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update subscriptions to inactive if payment failed more than 1 week ago
  UPDATE public.subscriptions
  SET status = 'inactive'
  WHERE payment_failed_at IS NOT NULL
    AND payment_failed_at < NOW() - INTERVAL '7 days'
    AND status = 'active';
    
  -- Update profile status to inactive for users with inactive subscriptions
  UPDATE public.profiles
  SET status = 'inactive'
  WHERE id IN (
    SELECT user_id 
    FROM public.subscriptions 
    WHERE status = 'inactive'
      AND payment_failed_at IS NOT NULL
  );
END;
$$;