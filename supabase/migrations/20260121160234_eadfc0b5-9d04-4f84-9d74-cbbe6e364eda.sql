-- Add net_collected_kwd column to monthly_coach_payments if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'monthly_coach_payments' 
    AND column_name = 'net_collected_kwd'
  ) THEN
    ALTER TABLE public.monthly_coach_payments 
    ADD COLUMN net_collected_kwd NUMERIC DEFAULT 0;
    
    COMMENT ON COLUMN public.monthly_coach_payments.net_collected_kwd IS 
      'Net amount collected after discounts: gross_revenue_kwd - discounts_applied_kwd';
  END IF;
END $$;