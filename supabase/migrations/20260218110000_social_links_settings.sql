-- Seed social media link entries into site_content
-- Admin manages URLs and toggles visibility from the dashboard.
-- Footer and Waitlist page read active links with non-empty values.

INSERT INTO site_content (page, section, key, value, value_type, sort_order, is_active) VALUES
  ('global', 'social_links', 'instagram', '', 'url', 1, true),
  ('global', 'social_links', 'tiktok', '', 'url', 2, true),
  ('global', 'social_links', 'youtube', '', 'url', 3, true),
  ('global', 'social_links', 'twitter', '', 'url', 4, false),
  ('global', 'social_links', 'snapchat', '', 'url', 5, false),
  ('global', 'social_links', 'facebook', '', 'url', 6, false),
  ('global', 'social_links', 'linkedin', '', 'url', 7, false)
ON CONFLICT (page, section, key) DO NOTHING;
