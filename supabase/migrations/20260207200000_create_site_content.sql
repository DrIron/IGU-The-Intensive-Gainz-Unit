-- Phase 1: Create site_content table for CMS-driven public content
-- This table stores all editable content for public pages (homepage, services, etc.)

CREATE TABLE public.site_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page TEXT NOT NULL DEFAULT 'homepage',
  section TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  value_type TEXT NOT NULL DEFAULT 'text'
    CHECK (value_type IN ('text', 'richtext', 'number', 'url', 'json')),
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page, section, key)
);

-- Add helpful comment
COMMENT ON TABLE public.site_content IS 'CMS-driven content for public pages. Admins can edit via /admin/site-content';

-- Indexes for common query patterns
CREATE INDEX idx_site_content_page_section ON public.site_content(page, section);
CREATE INDEX idx_site_content_active ON public.site_content(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- Anyone can read active site content (public pages need this)
CREATE POLICY "Anyone can read active site content"
  ON public.site_content FOR SELECT USING (is_active = true);

-- Admins can manage all site content
CREATE POLICY "Admins can manage site content"
  ON public.site_content FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_site_content_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER site_content_updated_at
  BEFORE UPDATE ON public.site_content
  FOR EACH ROW
  EXECUTE FUNCTION public.update_site_content_timestamp();
