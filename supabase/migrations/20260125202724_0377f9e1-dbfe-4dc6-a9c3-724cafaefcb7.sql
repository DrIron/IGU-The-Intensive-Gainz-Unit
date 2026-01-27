-- ============================================================
-- SECURITY FIX: Restrict legal_documents to authenticated users
-- Previously had public read policy with condition "true"
-- ============================================================

-- Drop the existing overly permissive policy
DROP POLICY IF EXISTS "Legal documents are viewable by everyone" ON public.legal_documents;

-- Create new policy: authenticated users only
CREATE POLICY "Legal documents viewable by authenticated users"
ON public.legal_documents
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

-- Ensure RLS is enabled
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;

-- Add security comment
COMMENT ON TABLE public.legal_documents IS 
'SECURITY: Legal document templates (not client-specific). 
RLS: SELECT restricted to authenticated users only. 
Anonymous users cannot access legal documents.';