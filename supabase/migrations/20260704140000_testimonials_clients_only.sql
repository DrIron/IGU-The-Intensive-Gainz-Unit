-- Testimonials — gate submission to real clients of the reviewed coach (Hasan, 2026-07-04).
-- A testimonial may be written ONLY by a client (member) of the coach being reviewed —
-- any subscription status (active or past). No self-endorsement; coaches/admins/non-clients
-- cannot submit. Moderation (is_approved default false, admin-only) + approved-only public
-- display are UNTOUCHED.

-- Helper: is this user a client of this coach, ever? SECURITY DEFINER so the INSERT WITH CHECK
-- sees all of the caller's subscription rows without depending on subscriptions RLS. Referenced
-- only by an authenticated-evaluated policy → grant authenticated, revoke public/anon.
CREATE OR REPLACE FUNCTION public.is_client_of_coach(p_client uuid, p_coach uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = p_client AND s.coach_id = p_coach   -- any status = active or past
  );
$$;

REVOKE ALL ON FUNCTION public.is_client_of_coach(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_client_of_coach(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_client_of_coach(uuid, uuid) TO authenticated;

-- Replace the permissive INSERT policy (was: auth.uid() = user_id, role public) with the
-- client-of-coach gate. `member` is the client role (app_role enum; client = 'member').
DROP POLICY IF EXISTS "Users can insert their own testimonials" ON public.testimonials;

CREATE POLICY "Clients can insert testimonials for their coach"
ON public.testimonials
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND coach_id IS NOT NULL
  AND auth.uid() <> coach_id                          -- no self-review
  AND public.has_role(auth.uid(), 'member')           -- must be a client (member role)
  AND public.is_client_of_coach(auth.uid(), coach_id) -- and an actual client of THIS coach
);
