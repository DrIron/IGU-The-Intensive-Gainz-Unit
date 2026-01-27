-- First, let's drop the existing policies and recreate them with active subscription checks
DROP POLICY IF EXISTS "Coaches can view their assigned clients' form submissions" ON public.form_submissions;
DROP POLICY IF EXISTS "Coaches can update their assigned clients' form submissions" ON public.form_submissions;

-- Create policy that restricts coaches to ONLY active client subscriptions
CREATE POLICY "Coaches can view their active clients' form submissions"
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
  -- Allow if user is a coach AND the submission belongs to one of their ACTIVE clients
  (
    has_role(auth.uid(), 'coach'::app_role)
    AND user_id IN (
      SELECT user_id 
      FROM public.subscriptions 
      WHERE coach_id = auth.uid()
      AND status = 'active'  -- CRITICAL: Only active subscriptions
    )
  )
);

-- Create restricted update policy with active subscription check
CREATE POLICY "Coaches can update their active clients' form submissions"
ON public.form_submissions
FOR UPDATE
TO authenticated
USING (
  -- Allow if user is an admin
  has_role(auth.uid(), 'admin'::app_role)
  OR
  -- Allow if user is a coach AND the submission belongs to one of their ACTIVE clients
  (
    has_role(auth.uid(), 'coach'::app_role)
    AND user_id IN (
      SELECT user_id 
      FROM public.subscriptions 
      WHERE coach_id = auth.uid()
      AND status = 'active'  -- CRITICAL: Only active subscriptions
    )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR
  (
    has_role(auth.uid(), 'coach'::app_role)
    AND user_id IN (
      SELECT user_id 
      FROM public.subscriptions 
      WHERE coach_id = auth.uid()
      AND status = 'active'
    )
  )
);

-- Secure the subscriptions table to prevent manipulation
-- Drop any existing overly permissive policies
DROP POLICY IF EXISTS "Coaches and admins can update subscriptions" ON public.subscriptions;

-- Create strict policies for subscription management
CREATE POLICY "Only admins can update subscription assignments"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Drop existing storage policies if they exist
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Coaches can view their active clients' documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Prevent document deletion" ON storage.objects;

-- Secure storage bucket for client documents
-- Only allow document owners and their assigned active coaches to access documents

-- Policy: Users can view their own documents
CREATE POLICY "Users can view their own documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Coaches can view their active clients' documents
CREATE POLICY "Coaches can view their active clients' documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR
    (
      has_role(auth.uid(), 'coach'::app_role)
      AND (storage.foldername(name))[1]::uuid IN (
        SELECT user_id::text::uuid
        FROM public.subscriptions 
        WHERE coach_id = auth.uid()
        AND status = 'active'
      )
    )
  )
);

-- Policy: Only document owners can upload (not coaches)
CREATE POLICY "Users can upload their own documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Prevent document deletion (medical records compliance)
CREATE POLICY "Prevent document deletion"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-documents'
  AND false  -- No one can delete documents
);

-- Add audit logging comments
COMMENT ON POLICY "Coaches can view their active clients' form submissions" ON public.form_submissions IS 'Critical security: Only allows access to form submissions where the coach has an ACTIVE subscription with the client. This prevents access after subscription cancellation or manipulation.';

COMMENT ON POLICY "Only admins can update subscription assignments" ON public.subscriptions IS 'Prevents coaches from manipulating subscription relationships to gain unauthorized access to client medical records.';