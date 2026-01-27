-- Create table for admin-uploaded legal documents
CREATE TABLE public.legal_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type TEXT NOT NULL UNIQUE CHECK (document_type IN ('terms_conditions', 'liability_release', 'privacy_policy', 'refund_policy', 'intellectual_property')),
  document_url TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

-- Everyone can view legal documents
CREATE POLICY "Legal documents are viewable by everyone"
ON public.legal_documents
FOR SELECT
USING (true);

-- Only admins can insert legal documents
CREATE POLICY "Admins can insert legal documents"
ON public.legal_documents
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update legal documents
CREATE POLICY "Admins can update legal documents"
ON public.legal_documents
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_legal_documents_updated_at
BEFORE UPDATE ON public.legal_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add columns to form_submissions for 1:1 client document workflow
ALTER TABLE public.form_submissions
ADD COLUMN coach_uploaded_agreement_url TEXT,
ADD COLUMN coach_uploaded_liability_url TEXT,
ADD COLUMN client_signed_agreement_url TEXT,
ADD COLUMN client_signed_liability_url TEXT,
ADD COLUMN documents_approved_by_coach BOOLEAN DEFAULT false,
ADD COLUMN documents_approved_at TIMESTAMP WITH TIME ZONE;

-- Add index for document type lookups
CREATE INDEX idx_legal_documents_type ON public.legal_documents(document_type);