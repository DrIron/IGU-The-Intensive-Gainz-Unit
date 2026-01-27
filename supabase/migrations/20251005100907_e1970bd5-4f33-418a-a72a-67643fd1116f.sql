-- Create storage bucket for client documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'client-documents',
  'client-documents',
  false,
  10485760, -- 10MB limit
  ARRAY['application/pdf']
);

-- RLS policies for client documents bucket
CREATE POLICY "Users can upload their own documents"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'client-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own documents"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'client-documents' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Coaches and admins can view all client documents"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'client-documents' AND
    (has_role(auth.uid(), 'coach'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- Users CANNOT delete their documents
CREATE POLICY "Only admins can delete client documents"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'client-documents' AND
    has_role(auth.uid(), 'admin'::app_role)
  );

-- Add document tracking to form_submissions table
ALTER TABLE public.form_submissions
ADD COLUMN master_agreement_url TEXT,
ADD COLUMN liability_release_url TEXT,
ADD COLUMN documents_verified BOOLEAN DEFAULT false,
ADD COLUMN verified_by_coach_id UUID REFERENCES public.coaches(id),
ADD COLUMN verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN payment_enabled BOOLEAN DEFAULT false;