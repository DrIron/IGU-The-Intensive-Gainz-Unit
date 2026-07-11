-- T1 Migration C — admin moderation floor: hide a testimonial everywhere
-- (overrides coach show_on_coach_page + admin featured_public). admin-only.

CREATE OR REPLACE FUNCTION public.set_testimonial_hidden(p_id uuid, p_hidden boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  UPDATE public.testimonials
     SET hidden_by_admin = p_hidden, updated_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_testimonial_hidden(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_testimonial_hidden(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_testimonial_hidden(uuid, boolean) TO authenticated;
