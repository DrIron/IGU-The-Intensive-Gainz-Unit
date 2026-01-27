-- Create table for monthly coach payments
CREATE TABLE public.monthly_coach_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_month DATE NOT NULL, -- First day of the month (e.g., 2024-01-01)
  coach_id UUID NOT NULL REFERENCES coaches(id),
  client_breakdown JSONB NOT NULL, -- {team: 5, onetoone_inperson: 2, etc}
  payment_rates JSONB NOT NULL, -- {team: 10, onetoone_inperson: 25, etc}
  total_clients INTEGER NOT NULL,
  total_payment NUMERIC(10,2) NOT NULL,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notes TEXT,
  UNIQUE(payment_month, coach_id)
);

-- Create index for faster queries
CREATE INDEX idx_monthly_coach_payments_month ON public.monthly_coach_payments(payment_month DESC);
CREATE INDEX idx_monthly_coach_payments_coach ON public.monthly_coach_payments(coach_id);
CREATE INDEX idx_monthly_coach_payments_unpaid ON public.monthly_coach_payments(is_paid) WHERE is_paid = false;

-- Enable RLS
ALTER TABLE public.monthly_coach_payments ENABLE ROW LEVEL SECURITY;

-- Admins can view all payments
CREATE POLICY "Admins can view all monthly payments"
ON public.monthly_coach_payments
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert monthly payments
CREATE POLICY "Admins can insert monthly payments"
ON public.monthly_coach_payments
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update monthly payments
CREATE POLICY "Admins can update monthly payments"
ON public.monthly_coach_payments
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Coaches can view their own payments
CREATE POLICY "Coaches can view their own monthly payments"
ON public.monthly_coach_payments
FOR SELECT
USING (
  coach_id IN (
    SELECT id FROM coaches WHERE user_id = auth.uid()
  )
);

-- Add trigger for updated_at
CREATE TRIGGER update_monthly_coach_payments_updated_at
BEFORE UPDATE ON public.monthly_coach_payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table for payment rate settings (to store the current rates)
CREATE TABLE public.coach_payment_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  onetoone_inperson_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  onetoone_hybrid_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  onetoone_online_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  effective_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.coach_payment_rates ENABLE ROW LEVEL SECURITY;

-- Only admins can manage payment rates
CREATE POLICY "Admins can view payment rates"
ON public.coach_payment_rates
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert payment rates"
ON public.coach_payment_rates
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update payment rates"
ON public.coach_payment_rates
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));