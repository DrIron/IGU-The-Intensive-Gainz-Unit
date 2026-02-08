-- Seed SEO meta tags for all public pages

-- Homepage meta tags
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order, is_active)
VALUES
  ('homepage', 'meta', 'title', 'Intensive Gainz Unit | Professional Fitness Coaching', 'text', 1, true),
  ('homepage', 'meta', 'description', 'Evidence-based online coaching, team programs, and performance tracking for serious lifters. Transform your training with IGU.', 'text', 2, true),
  ('homepage', 'meta', 'og_image', 'https://theigu.com/og-image.jpg', 'url', 3, true)
ON CONFLICT (page, section, key) DO UPDATE SET
  value = EXCLUDED.value,
  value_type = EXCLUDED.value_type,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- Services page meta tags
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order, is_active)
VALUES
  ('services', 'meta', 'title', 'Coaching Programs | Intensive Gainz Unit', 'text', 1, true),
  ('services', 'meta', 'description', 'Choose from team training or personalized 1:1 coaching programs. Online, hybrid, and in-person options available.', 'text', 2, true),
  ('services', 'meta', 'og_image', 'https://theigu.com/og-services.jpg', 'url', 3, true)
ON CONFLICT (page, section, key) DO UPDATE SET
  value = EXCLUDED.value,
  value_type = EXCLUDED.value_type,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- Meet Our Team page meta tags
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order, is_active)
VALUES
  ('meet-our-team', 'meta', 'title', 'Meet Our Coaches | Intensive Gainz Unit', 'text', 1, true),
  ('meet-our-team', 'meta', 'description', 'Meet the experienced coaches behind IGU. Learn about their backgrounds, specializations, and coaching philosophy.', 'text', 2, true),
  ('meet-our-team', 'meta', 'og_image', 'https://theigu.com/og-team.jpg', 'url', 3, true)
ON CONFLICT (page, section, key) DO UPDATE SET
  value = EXCLUDED.value,
  value_type = EXCLUDED.value_type,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;

-- Calorie Calculator page meta tags
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order, is_active)
VALUES
  ('calorie-calculator', 'meta', 'title', 'Calorie Calculator | Intensive Gainz Unit', 'text', 1, true),
  ('calorie-calculator', 'meta', 'description', 'Calculate your daily calorie needs with our advanced calculator. Get personalized macros for cutting, bulking, or maintenance.', 'text', 2, true),
  ('calorie-calculator', 'meta', 'og_image', 'https://theigu.com/og-calculator.jpg', 'url', 3, true)
ON CONFLICT (page, section, key) DO UPDATE SET
  value = EXCLUDED.value,
  value_type = EXCLUDED.value_type,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;
