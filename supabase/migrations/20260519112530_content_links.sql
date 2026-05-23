BEGIN;

-- ========== 1. PROGRAM TEMPLATE CONTENT LINKS ==========
-- One row per (template, video|playlist). Shared across every active
-- client_program with this source_template_id.

CREATE TABLE IF NOT EXISTS public.program_template_content_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_template_id UUID NOT NULL REFERENCES public.program_templates(id) ON DELETE CASCADE,
  video_id    UUID REFERENCES public.educational_videos(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.video_playlists(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  note        TEXT NULL,
  added_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((video_id IS NULL) <> (playlist_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_ptcl_template ON public.program_template_content_links (program_template_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ptcl_video
  ON public.program_template_content_links (program_template_id, video_id)
  WHERE video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ptcl_playlist
  ON public.program_template_content_links (program_template_id, playlist_id)
  WHERE playlist_id IS NOT NULL;

ALTER TABLE public.program_template_content_links ENABLE ROW LEVEL SECURITY;

-- Read: template owner OR admin OR a client whose ACTIVE client_programs row uses this template
CREATE POLICY "ptcl_select_owner_admin_assigned"
  ON public.program_template_content_links
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.program_templates pt
      WHERE pt.id = program_template_content_links.program_template_id
        AND pt.owner_coach_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.client_programs cp
      WHERE cp.user_id = auth.uid()
        AND cp.source_template_id = program_template_content_links.program_template_id
        AND cp.status = 'active'
    )
  );

-- Write: template owner OR admin
CREATE POLICY "ptcl_write_owner_admin"
  ON public.program_template_content_links
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.program_templates pt
      WHERE pt.id = program_template_content_links.program_template_id
        AND pt.owner_coach_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.program_templates pt
      WHERE pt.id = program_template_content_links.program_template_id
        AND pt.owner_coach_id = auth.uid()
    )
  );

REVOKE ALL ON public.program_template_content_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_template_content_links TO authenticated;

-- ========== 2. NUTRITION PHASE CONTENT LINKS ==========
-- Per-client. Phase row carries user_id + coach_id; we gate via it.

CREATE TABLE IF NOT EXISTS public.nutrition_phase_content_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nutrition_phase_id UUID NOT NULL REFERENCES public.nutrition_phases(id) ON DELETE CASCADE,
  video_id    UUID REFERENCES public.educational_videos(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES public.video_playlists(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT false,
  note        TEXT NULL,
  added_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((video_id IS NULL) <> (playlist_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_npcl_phase ON public.nutrition_phase_content_links (nutrition_phase_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_npcl_video
  ON public.nutrition_phase_content_links (nutrition_phase_id, video_id)
  WHERE video_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_npcl_playlist
  ON public.nutrition_phase_content_links (nutrition_phase_id, playlist_id)
  WHERE playlist_id IS NOT NULL;

ALTER TABLE public.nutrition_phase_content_links ENABLE ROW LEVEL SECURITY;

-- Client reads their own
CREATE POLICY "npcl_client_read_own"
  ON public.nutrition_phase_content_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nutrition_phases np
      WHERE np.id = nutrition_phase_content_links.nutrition_phase_id
        AND np.user_id = auth.uid()
    )
  );

-- Primary coach manages
CREATE POLICY "npcl_primary_coach_manages"
  ON public.nutrition_phase_content_links
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nutrition_phases np
      WHERE np.id = nutrition_phase_content_links.nutrition_phase_id
        AND public.is_primary_coach_for_user(auth.uid(), np.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nutrition_phases np
      WHERE np.id = nutrition_phase_content_links.nutrition_phase_id
        AND public.is_primary_coach_for_user(auth.uid(), np.user_id)
    )
  );

-- Care team reads
CREATE POLICY "npcl_care_team_reads"
  ON public.nutrition_phase_content_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nutrition_phases np
      WHERE np.id = nutrition_phase_content_links.nutrition_phase_id
        AND public.is_on_active_care_team_for_client(auth.uid(), np.user_id)
    )
  );

-- Admin all
CREATE POLICY "npcl_admin_all"
  ON public.nutrition_phase_content_links
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

REVOKE ALL ON public.nutrition_phase_content_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nutrition_phase_content_links TO authenticated;

COMMIT;
