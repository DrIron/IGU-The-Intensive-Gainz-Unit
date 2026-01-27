-- Create coach_change_requests table
CREATE TABLE public.coach_change_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  current_coach_id UUID REFERENCES coaches(user_id),
  requested_coach_id UUID NOT NULL REFERENCES coaches(user_id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES coaches(user_id)
);

-- Enable RLS
ALTER TABLE public.coach_change_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own coach change requests
CREATE POLICY "Users can view their own coach change requests"
ON public.coach_change_requests
FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own coach change requests
CREATE POLICY "Users can create coach change requests"
ON public.coach_change_requests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Coaches can view requests for themselves
CREATE POLICY "Coaches can view their coach change requests"
ON public.coach_change_requests
FOR SELECT
USING (
  auth.uid() = requested_coach_id OR 
  auth.uid() = current_coach_id OR
  has_role(auth.uid(), 'admin'::app_role)
);

-- Coaches can update requests directed to them
CREATE POLICY "Coaches can update coach change requests"
ON public.coach_change_requests
FOR UPDATE
USING (
  auth.uid() = requested_coach_id OR 
  has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  auth.uid() = requested_coach_id OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Add trigger for updated_at
CREATE TRIGGER update_coach_change_requests_updated_at
BEFORE UPDATE ON public.coach_change_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();