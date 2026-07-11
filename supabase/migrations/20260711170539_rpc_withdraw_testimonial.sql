-- T1 Migration C — client retracts (or restores) their testimonial from public
-- display. SECURITY DEFINER; caller must own the row. Reversible: p_withdrawn
-- true → withdrawn_at = now() (hidden everywhere), false → NULL. authenticated-only.

CREATE OR REPLACE FUNCTION public.withdraw_testimonial(p_id uuid, p_withdrawn boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.testimonials WHERE id = p_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to update this testimonial';
  END IF;
  UPDATE public.testimonials
     SET withdrawn_at = CASE WHEN p_withdrawn THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_testimonial(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.withdraw_testimonial(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.withdraw_testimonial(uuid, boolean) TO authenticated;
