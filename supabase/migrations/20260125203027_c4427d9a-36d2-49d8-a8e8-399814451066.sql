-- ============================================================
-- SECURITY FIX: Restrict services table to authenticated users
-- Previously allowed public read for active services
-- ============================================================

-- Drop existing overly permissive policy
DROP POLICY IF EXISTS "Services are viewable by everyone" ON public.services;

-- Create new policy: authenticated users can read active services
CREATE POLICY "Services viewable by authenticated users"
ON public.services
FOR SELECT
TO authenticated
USING (is_active = true);

-- Ensure admins can still manage all services
DROP POLICY IF EXISTS "Admins can manage services" ON public.services;

CREATE POLICY "Admins can manage all services"
ON public.services
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Ensure RLS is enabled
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- Add security comment
COMMENT ON TABLE public.services IS 
'SECURITY: Service catalog with pricing. 
RLS: SELECT restricted to authenticated users only (active services). 
Admins have full CRUD access. Anonymous users blocked.';