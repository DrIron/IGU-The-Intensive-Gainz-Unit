-- Add RLS policies for legal documents upload in client-documents bucket
-- Admins can insert/update/delete files in the legal/ folder

-- Allow admins to upload legal documents
CREATE POLICY "Admins can upload legal documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-documents' 
  AND (storage.foldername(name))[1] = 'legal'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to update legal documents
CREATE POLICY "Admins can update legal documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-documents' 
  AND (storage.foldername(name))[1] = 'legal'
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id = 'client-documents' 
  AND (storage.foldername(name))[1] = 'legal'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow admins to delete legal documents
CREATE POLICY "Admins can delete legal documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-documents' 
  AND (storage.foldername(name))[1] = 'legal'
  AND public.has_role(auth.uid(), 'admin')
);

-- Allow public read access to legal documents (so clients can view them during onboarding)
CREATE POLICY "Anyone can read legal documents"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'client-documents' 
  AND (storage.foldername(name))[1] = 'legal'
);