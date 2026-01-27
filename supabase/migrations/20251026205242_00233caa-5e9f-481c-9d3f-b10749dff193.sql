-- Create coach_service_limits table to store client limits per coach per service
CREATE TABLE public.coach_service_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  max_clients INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(coach_id, service_id)
);

-- Enable RLS
ALTER TABLE public.coach_service_limits ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view all coach service limits"
ON public.coach_service_limits
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert coach service limits"
ON public.coach_service_limits
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update coach service limits"
ON public.coach_service_limits
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete coach service limits"
ON public.coach_service_limits
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Coaches can view their own limits
CREATE POLICY "Coaches can view their own service limits"
ON public.coach_service_limits
FOR SELECT
TO authenticated
USING (coach_id IN (SELECT id FROM public.coaches WHERE user_id = auth.uid()));

-- Trigger to update updated_at
CREATE TRIGGER update_coach_service_limits_updated_at
BEFORE UPDATE ON public.coach_service_limits
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();