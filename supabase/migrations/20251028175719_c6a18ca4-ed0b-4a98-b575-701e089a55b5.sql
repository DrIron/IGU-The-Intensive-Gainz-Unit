-- Prevent coaches from self-approving by blocking status field updates
-- Only admins should be able to change coach status

-- Drop the existing generic update policy for coaches
DROP POLICY IF EXISTS "Coaches can update their own profile" ON public.coaches;

-- Create new policy that allows coaches to update their profile EXCEPT status field
CREATE POLICY "Coaches can update their own profile (except status)"
  ON public.coaches
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id AND
    -- Prevent coaches from changing their own status
    (status IS NOT DISTINCT FROM (SELECT status FROM public.coaches WHERE id = coaches.id))
  );

-- Create admin-only policy for updating coach status
CREATE POLICY "Admins can update all coach fields including status"
  ON public.coaches
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));