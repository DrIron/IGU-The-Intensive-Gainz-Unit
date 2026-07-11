-- T1 Migration C — coach toggles a review-about-them on/off their public page.
-- SECURITY DEFINER (bypasses the locked-down RLS); caller must own the review
-- (coach_id = auth.uid()). authenticated-only.

CREATE OR REPLACE FUNCTION public.set_testimonial_coach_visibility(p_id uuid, p_show boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.testimonials WHERE id = p_id AND coach_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to curate this testimonial';
  END IF;
  UPDATE public.testimonials
     SET show_on_coach_page = p_show, updated_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_testimonial_coach_visibility(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_testimonial_coach_visibility(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_testimonial_coach_visibility(uuid, boolean) TO authenticated;
