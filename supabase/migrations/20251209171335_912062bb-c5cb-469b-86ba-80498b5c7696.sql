-- Add discount tracking to monthly_coach_payments
ALTER TABLE public.monthly_coach_payments 
ADD COLUMN IF NOT EXISTS discounts_applied_kwd numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS gross_revenue_kwd numeric DEFAULT 0;

COMMENT ON COLUMN public.monthly_coach_payments.discounts_applied_kwd IS 'Total discounts applied to clients served by this coach in this month';
COMMENT ON COLUMN public.monthly_coach_payments.gross_revenue_kwd IS 'Total list price revenue from clients served by this coach in this month';