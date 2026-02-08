-- Seed WhatsApp contact settings for homepage
-- Note: whatsapp_number is empty by default - admin must set it to enable the button
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order, is_active)
VALUES
  ('homepage', 'contact', 'whatsapp_number', '', 'text', 1, true),
  ('homepage', 'contact', 'whatsapp_message', 'Hi! I''m interested in IGU coaching programs.', 'text', 2, true)
ON CONFLICT (page, section, key) DO UPDATE SET
  value = EXCLUDED.value,
  value_type = EXCLUDED.value_type,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;
