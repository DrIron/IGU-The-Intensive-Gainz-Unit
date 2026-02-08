-- Seed How It Works section content for homepage
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order, is_active)
VALUES
  ('homepage', 'how_it_works', 'title', 'How It Works', 'text', 1, true),
  ('homepage', 'how_it_works', 'subtitle', 'Your journey to gains in 4 simple steps', 'text', 2, true),
  ('homepage', 'how_it_works', 'step_1_title', 'Choose Your Plan', 'text', 3, true),
  ('homepage', 'how_it_works', 'step_1_description', 'Browse our team training and 1:1 coaching options. Select the program that matches your goals and budget.', 'text', 4, true),
  ('homepage', 'how_it_works', 'step_1_icon', 'ClipboardCheck', 'text', 5, true),
  ('homepage', 'how_it_works', 'step_2_title', 'Complete Onboarding', 'text', 6, true),
  ('homepage', 'how_it_works', 'step_2_description', 'Fill out your intake form with training history, goals, and preferences so we can customize your experience.', 'text', 7, true),
  ('homepage', 'how_it_works', 'step_2_icon', 'UserCheck', 'text', 8, true),
  ('homepage', 'how_it_works', 'step_3_title', 'Get Matched', 'text', 9, true),
  ('homepage', 'how_it_works', 'step_3_description', 'We''ll pair you with a coach who specializes in your goals. 1:1 clients get personalized programming.', 'text', 10, true),
  ('homepage', 'how_it_works', 'step_3_icon', 'Dumbbell', 'text', 11, true),
  ('homepage', 'how_it_works', 'step_4_title', 'Start Training', 'text', 12, true),
  ('homepage', 'how_it_works', 'step_4_description', 'Access your program through our app, track workouts, and communicate with your coach. Let''s go!', 'text', 13, true),
  ('homepage', 'how_it_works', 'step_4_icon', 'Rocket', 'text', 14, true)
ON CONFLICT (page, section, key) DO UPDATE SET
  value = EXCLUDED.value,
  value_type = EXCLUDED.value_type,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;
