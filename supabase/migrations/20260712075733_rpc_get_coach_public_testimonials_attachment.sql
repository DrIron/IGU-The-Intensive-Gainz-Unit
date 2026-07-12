-- T3.1 Migration B — extend the anon coach-reputation list RPC to also return the
-- proof attachment (attachment_type / attachment / attachment_note) per row, so
-- the public reputation block can render the weight-change proof chip. Unchanged
-- otherwise (visibility filter, attribution-derived display_name). Stays anon.

CREATE OR REPLACE FUNCTION public.get_coach_public_testimonials(p_coach_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', t.id,
      'rating', t.rating,
      'feedback', t.feedback,
      'created_at', t.created_at,
      'display_name', COALESCE(NULLIF(
        CASE t.attribution
          WHEN 'anonymous' THEN 'IGU client'
          WHEN 'full_name'  THEN trim(t.author_display_name)
          ELSE  -- first_initial
            CASE
              WHEN split_part(trim(coalesce(t.author_display_name, '')), ' ', 2) <> ''
                THEN split_part(trim(t.author_display_name), ' ', 1) || ' '
                     || left(split_part(trim(t.author_display_name), ' ', 2), 1) || '.'
              ELSE split_part(trim(coalesce(t.author_display_name, '')), ' ', 1)
            END
        END, ''), 'IGU client'),
      'attachment_type', t.attachment_type,
      'attachment', t.attachment,
      'attachment_note', t.attachment_note
    )
    ORDER BY t.created_at DESC
  ), '[]'::jsonb)
  FROM public.testimonials t
  WHERE t.coach_id = p_coach_user_id
    AND t.display_consent
    AND t.withdrawn_at IS NULL
    AND t.show_on_coach_page
    AND NOT t.hidden_by_admin;
$$;

REVOKE ALL ON FUNCTION public.get_coach_public_testimonials(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_coach_public_testimonials(uuid) TO anon, authenticated;
