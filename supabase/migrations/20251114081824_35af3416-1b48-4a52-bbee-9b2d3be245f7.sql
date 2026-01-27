-- Create table for coach payment history
CREATE TABLE public.coach_payment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  total_coaches INTEGER NOT NULL,
  total_clients INTEGER NOT NULL,
  total_payment NUMERIC(10,2) NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('calculated', 'exported')),
  payment_data JSONB NOT NULL,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coach_payment_history ENABLE ROW LEVEL SECURITY;

-- Only admins can view payment history
CREATE POLICY "Admins can view payment history"
ON public.coach_payment_history
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert payment history
CREATE POLICY "Admins can insert payment history"
ON public.coach_payment_history
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add index for faster queries
CREATE INDEX idx_coach_payment_history_created_at ON public.coach_payment_history(created_at DESC);
CREATE INDEX idx_coach_payment_history_action_type ON public.coach_payment_history(action_type);

-- Add trigger for updated_at
CREATE TRIGGER update_coach_payment_history_updated_at
BEFORE UPDATE ON public.coach_payment_history
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();