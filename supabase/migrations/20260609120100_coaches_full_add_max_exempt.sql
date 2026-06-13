-- Expose coaches_public.max_exempt_clients through the coaches_full view so the
-- admin ProfessionalLevelManager (which reads coaches_full) can show/edit it.
-- Definition copied verbatim from the live view (joins coaches_public +
-- coaches_private on user_id) with max_exempt_clients appended at the end.
-- NOTE: coaches_full is rebuilt again in Phase 3 of the coach column-ownership
-- refactor; this CREATE OR REPLACE only appends a column and preserves order.
CREATE OR REPLACE VIEW public.coaches_full AS
 SELECT cp.id,
    cp.user_id,
    cp.first_name,
    cp.last_name,
    cp.nickname,
    cp.display_name,
    cp.bio,
    cp.short_bio,
    cp.location,
    cp.profile_picture_url,
    cp.qualifications,
    cp.specializations,
    cp.specialties,
    cp.status,
    cp.max_onetoone_clients,
    cp.max_team_clients,
    cp.last_assigned_at,
    cp.created_at,
    cp.updated_at,
    cp.instagram_url,
    cp.tiktok_url,
    cp.youtube_url,
    cp.coach_level,
    cp.is_head_coach,
    cp.head_coach_specialisation,
    cpriv.email,
    cpriv.phone,
    cpriv.whatsapp_number,
    cpriv.date_of_birth,
    cpriv.gender,
    cpriv.snapchat_url,
    cp.max_exempt_clients
   FROM coaches_public cp
     LEFT JOIN coaches_private cpriv ON cp.user_id = cpriv.user_id;
