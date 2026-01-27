-- Align coach visibility policy with actual statuses used in the table
-- Drop old policy that required status = 'approved'
DROP POLICY IF EXISTS "Authenticated can view approved coaches with contact info" ON public.coaches;

-- Create new policy allowing authenticated users to view coaches with status = 'active'
CREATE POLICY "Authenticated can view active coaches with contact info"
ON public.coaches
FOR SELECT
TO authenticated
USING (status = 'active');