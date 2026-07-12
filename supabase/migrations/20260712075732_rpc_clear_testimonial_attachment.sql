-- T3.1 Migration B — remove a proof attachment from the caller's own testimonial.
-- authenticated-only; user_id = auth.uid().

CREATE OR REPLACE FUNCTION public.clear_testimonial_attachment(p_testimonial_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.testimonials WHERE id = p_testimonial_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized for this testimonial';
  END IF;
  UPDATE public.testimonials
     SET attachment_type = 'none',
         attachment = NULL,
         attachment_note = NULL,
         updated_at = now()
   WHERE id = p_testimonial_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_testimonial_attachment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_testimonial_attachment(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.clear_testimonial_attachment(uuid) TO authenticated;
