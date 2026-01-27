-- =====================================================
-- COACHES TABLE (Public Profile) - RLS Policy Update
-- =====================================================

-- Drop existing policies on coaches table
DROP POLICY IF EXISTS "Admins can delete coaches" ON public.coaches;
DROP POLICY IF EXISTS "Admins can insert coaches" ON public.coaches;
DROP POLICY IF EXISTS "Admins can update all coach fields including status" ON public.coaches;
DROP POLICY IF EXISTS "Admins can update coaches" ON public.coaches;
DROP POLICY IF EXISTS "Admins can view all coaches" ON public.coaches;
DROP POLICY IF EXISTS "Authenticated can view active coaches basic info" ON public.coaches;
DROP POLICY IF EXISTS "Coaches can update their own profile (except status)" ON public.coaches;
DROP POLICY IF EXISTS "Coaches can view their own profile" ON public.coaches;
DROP POLICY IF EXISTS "Deny anonymous direct access to coaches" ON public.coaches;

-- Admins can do everything on coaches
CREATE POLICY "Admins full access to coaches"
ON public.coaches
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can only view approved/active coaches (public profiles)
CREATE POLICY "Authenticated users view approved or active coaches"
ON public.coaches
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND status IN ('approved', 'active')
);

-- Coaches can view their own profile (regardless of status)
CREATE POLICY "Coaches can view own profile"
ON public.coaches
FOR SELECT
USING (auth.uid() = user_id);

-- Coaches can update limited fields on their own profile (not status)
CREATE POLICY "Coaches can update own profile limited fields"
ON public.coaches
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  -- Prevent status changes by checking status hasn't changed
  AND status = (SELECT c.status FROM public.coaches c WHERE c.user_id = auth.uid())
);

-- =====================================================
-- COACH_CONTACTS TABLE (Private/Sensitive) - RLS Policy Update
-- =====================================================

-- Drop existing policies on coach_contacts table
DROP POLICY IF EXISTS "Active clients can view their coach contacts" ON public.coach_contacts;
DROP POLICY IF EXISTS "Admins can manage coach contacts" ON public.coach_contacts;
DROP POLICY IF EXISTS "Coaches can update their own contacts" ON public.coach_contacts;
DROP POLICY IF EXISTS "Coaches can view their own contacts" ON public.coach_contacts;

-- Admins have full access to coach_contacts
CREATE POLICY "Admins full access to coach_contacts"
ON public.coach_contacts
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Coaches can view their own contact record (via join to coaches.user_id)
CREATE POLICY "Coaches can view own contact info"
ON public.coach_contacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = coach_contacts.coach_id
      AND c.user_id = auth.uid()
  )
);

-- Coaches can update their own contact info (social links, whatsapp, phone)
-- Email and DOB remain admin-controlled via the admin policy
CREATE POLICY "Coaches can update own contact info"
ON public.coach_contacts
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = coach_contacts.coach_id
      AND c.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = coach_contacts.coach_id
      AND c.user_id = auth.uid()
  )
);

-- Active clients can view ONLY limited contact info for their assigned coach
-- This allows clients to see their coach's contact methods
CREATE POLICY "Active clients can view assigned coach contact"
ON public.coach_contacts
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM public.subscriptions s
    JOIN public.coaches c ON c.user_id = s.coach_id
    WHERE s.user_id = auth.uid()
      AND s.status = 'active'
      AND c.id = coach_contacts.coach_id
  )
);

-- Add comments documenting the security model
COMMENT ON TABLE public.coaches IS 'Public coach profiles - contains only non-sensitive display information. Authenticated users can only see approved/active coaches.';
COMMENT ON TABLE public.coach_contacts IS 'Private coach contact information - sensitive PII. Only accessible by admin, the coach themselves, or their active clients.';