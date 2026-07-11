-- T1 Migration C — anon read: a coach's publicly-visible testimonials for the
-- /coaches/:slug reputation block. Visibility rule (§2) AND show_on_coach_page.
-- display_name derived server-side from attribution so anon never needs the
-- client's profile. Anon-callable by design (like get_coach_public_profile_by_slug).
--
-- Attribution → display_name:
--   full_name     → author_display_name
--   first_initial → "<first> <Second initial>." (fallback: first token only)
--   anonymous     → "IGU client"
-- (initials derived from the author_display_name snapshot; step 2 may snapshot
-- first/last separately for cleaner initials — fine for now.)

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
        END, ''), 'IGU client')
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
