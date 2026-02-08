-- Seed FAQ content for homepage
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order, is_active)
VALUES
  ('homepage', 'faq', 'title', 'Frequently Asked Questions', 'text', 1, true),
  ('homepage', 'faq', 'subtitle', 'Everything you need to know about our coaching programs', 'text', 2, true),
  ('homepage', 'faq', 'items', '[
    {"question": "How do the coaching programs work?", "answer": "After signing up, you''ll complete an intake form and be matched with a coach. You''ll receive a personalized training program, direct messaging access, and regular check-ins based on your chosen plan."},
    {"question": "What''s the difference between Team and 1:1 coaching?", "answer": "Team programs follow a structured group programming approach at a lower price point. 1:1 coaching provides fully personalized programming, direct coach messaging, and weekly check-ins tailored to your specific goals."},
    {"question": "How do I communicate with my coach?", "answer": "All communication happens through our platform. 1:1 clients get direct messaging with their coach. Team members have access to our Discord community and can ask questions during scheduled Q&A sessions."},
    {"question": "Can I switch between programs?", "answer": "Yes! You can upgrade or change your program at any time. Contact support and we''ll help you transition to a new plan that better fits your needs."},
    {"question": "What equipment do I need?", "answer": "Most programs are designed for a standard gym with barbells, dumbbells, and machines. During onboarding, you''ll tell us about your available equipment and we''ll customize accordingly."},
    {"question": "How is the program delivered?", "answer": "Your program is accessible through our web app. You can view workouts, log your training, track progress, and communicate with your coach all in one place."},
    {"question": "What''s included in nutrition coaching?", "answer": "1:1 plans include personalized macro targets, weekly nutrition check-ins, and adjustments based on your progress. We use evidence-based approaches to help you reach your body composition goals."},
    {"question": "What if I''m not satisfied?", "answer": "We stand behind our coaching. If you''re not seeing results after following the program, reach out to your coach or support. We''ll work with you to adjust your approach or discuss options."}
  ]', 'json', 3, true)
ON CONFLICT (page, section, key) DO UPDATE SET
  value = EXCLUDED.value,
  value_type = EXCLUDED.value_type,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active;
