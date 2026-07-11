-- T1 Migration C — admin features a testimonial on the public /testimonials
-- rotation + sets its rank. SECURITY DEFINER, admin-only, authenticated.

CREATE OR REPLACE FUNCTION public.set_testimonial_featured(p_id uuid, p_featured boolean, p_rank integer)
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
     SET featured_public = p_featured, featured_rank = p_rank, updated_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_testimonial_featured(uuid, boolean, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_testimonial_featured(uuid, boolean, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_testimonial_featured(uuid, boolean, integer) TO authenticated;
