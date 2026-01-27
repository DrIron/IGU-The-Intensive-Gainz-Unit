-- 1. Create coach_contacts table for sensitive contact info
CREATE TABLE public.coach_contacts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  email text NOT NULL,
  whatsapp_number text,
  phone text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(coach_id)
);

-- 2. Migrate existing contact data from coaches to coach_contacts
INSERT INTO public.coach_contacts (coach_id, email, whatsapp_number)
SELECT id, email, whatsapp_number
FROM public.coaches
WHERE email IS NOT NULL;

-- 3. Enable RLS on coach_contacts
ALTER TABLE public.coach_contacts ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for coach_contacts

-- Admins can do everything
CREATE POLICY "Admins can manage coach contacts"
ON public.coach_contacts
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Coaches can view and update their own contact info
CREATE POLICY "Coaches can view their own contacts"
ON public.coach_contacts
FOR SELECT
USING (
  coach_id IN (
    SELECT id FROM public.coaches WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Coaches can update their own contacts"
ON public.coach_contacts
FOR UPDATE
USING (
  coach_id IN (
    SELECT id FROM public.coaches WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  coach_id IN (
    SELECT id FROM public.coaches WHERE user_id = auth.uid()
  )
);

-- Active clients can view their assigned coach's contact info
CREATE POLICY "Active clients can view their coach contacts"
ON public.coach_contacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    JOIN public.coaches c ON c.user_id = s.coach_id
    WHERE s.user_id = auth.uid()
      AND s.status = 'active'
      AND c.id = coach_contacts.coach_id
  )
);

-- 5. Update coaches table RLS - remove the policy that exposes contact info to all authenticated users
DROP POLICY IF EXISTS "Authenticated can view active coaches with contact info" ON public.coaches;

-- 6. Create new restrictive policy for coaches table - expose only non-sensitive fields
-- (The actual field restriction will be handled by the view, but we still need a SELECT policy)
CREATE POLICY "Authenticated can view active coaches basic info"
ON public.coaches
FOR SELECT
USING (status = 'active');

-- 7. Create trigger to update updated_at
CREATE TRIGGER update_coach_contacts_updated_at
  BEFORE UPDATE ON public.coach_contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();