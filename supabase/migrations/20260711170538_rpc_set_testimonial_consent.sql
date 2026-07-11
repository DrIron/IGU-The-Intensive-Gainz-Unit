-- T1 Migration C — client sets public-display consent + attribution on their
-- own testimonial. SECURITY DEFINER; caller must own the row (user_id =
-- auth.uid()); attribution validated against the enum. authenticated-only.

CREATE OR REPLACE FUNCTION public.set_testimonial_consent(p_id uuid, p_consent boolean, p_attribution text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_attribution NOT IN ('full_name','first_initial','anonymous') THEN
    RAISE EXCEPTION 'Invalid attribution: %', p_attribution;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.testimonials WHERE id = p_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to update this testimonial';
  END IF;
  UPDATE public.testimonials
     SET display_consent = p_consent, attribution = p_attribution, updated_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_testimonial_consent(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_testimonial_consent(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_testimonial_consent(uuid, boolean, text) TO authenticated;
