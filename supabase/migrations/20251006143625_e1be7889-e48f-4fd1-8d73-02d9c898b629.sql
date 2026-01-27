-- Drop the overly permissive policy that allows all coaches to update all submissions
DROP POLICY IF EXISTS "Admins and coaches can update form submissions" ON public.form_submissions;

-- Create a more restrictive policy for coaches to view ONLY their assigned clients' submissions
CREATE POLICY "Coaches can view their assigned clients' form submissions"
ON public.form_submissions
FOR SELECT
TO authenticated
USING (
  -- Allow if user is viewing their own submission
  auth.uid() = user_id
  OR
  -- Allow if user is an admin
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Allow if user is a coach AND the submission belongs to one of their assigned clients
  (
    has_role(auth.uid(), 'coach'::app_role)
    AND user_id IN (
      SELECT user_id 
      FROM public.subscriptions 
      WHERE coach_id = auth.uid()
    )
  )
);

-- Create a restricted update policy for coaches to update ONLY their assigned clients' submissions
CREATE POLICY "Coaches can update their assigned clients' form submissions"
ON public.form_submissions
FOR UPDATE
TO authenticated
USING (
  -- Allow if user is an admin
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Allow if user is a coach AND the submission belongs to one of their assigned clients
  (
    has_role(auth.uid(), 'coach'::app_role)
    AND user_id IN (
      SELECT user_id 
      FROM public.subscriptions 
      WHERE coach_id = auth.uid()
    )
  )
)
WITH CHECK (
  -- Same conditions for the updated data
  has_role(auth.uid(), 'admin'::app_role)
  OR
  (
    has_role(auth.uid(), 'coach'::app_role)
    AND user_id IN (
      SELECT user_id 
      FROM public.subscriptions 
      WHERE coach_id = auth.uid()
    )
  )
);

-- Add a policy to prevent deletion of form submissions (medical records should not be deleted)
CREATE POLICY "Prevent deletion of medical records"
ON public.form_submissions
FOR DELETE
TO authenticated
USING (false);

-- Add comments for documentation
COMMENT ON TABLE public.form_submissions IS 'Contains sensitive medical information (PAR-Q data) and PII. Access is strictly controlled through RLS policies that limit coaches to only their assigned clients.';

COMMENT ON POLICY "Coaches can view their assigned clients' form submissions" ON public.form_submissions IS 'Restricts coaches to view only form submissions of clients they are assigned to via the subscriptions table, preventing unauthorized access to medical records.';

COMMENT ON POLICY "Prevent deletion of medical records" ON public.form_submissions IS 'Medical records should never be deleted for legal and compliance reasons. Soft deletes or archiving should be used instead if needed.';