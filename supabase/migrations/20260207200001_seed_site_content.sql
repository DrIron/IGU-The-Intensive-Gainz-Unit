-- Phase 1: Seed initial site content
-- Pricing source of truth: 12 / 50 / 175 / 250 KWD

-- ============================================
-- HOMEPAGE CONTENT
-- ============================================

-- Hero Section
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order) VALUES
('homepage', 'hero', 'badge', 'Evidence-Based Coaching', 'text', 0),
('homepage', 'hero', 'title_line1', 'THE INTENSIVE', 'text', 1),
('homepage', 'hero', 'title_line2', 'GAINZ UNIT', 'text', 2),
('homepage', 'hero', 'subtitle', 'Professional bodybuilding coaching tailored to your goals. Choose from team training or personalized 1:1 programs.', 'text', 3),
('homepage', 'hero', 'cta_primary', 'Choose Your Plan', 'text', 4),
('homepage', 'hero', 'cta_secondary', 'Log in to your dashboard', 'text', 5);

-- Features Section (6 features)
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order) VALUES
('homepage', 'features', 'title', 'Why Choose IGU?', 'text', 0),
('homepage', 'features', 'subtitle', 'Everything you need for serious progress', 'text', 1),
('homepage', 'features', 'feature_1_title', 'Personalized Programs', 'text', 10),
('homepage', 'features', 'feature_1_description', 'Custom training programs designed around your schedule, equipment access, and specific goals. Updated weekly based on your progress.', 'text', 11),
('homepage', 'features', 'feature_1_icon', 'Target', 'text', 12),
('homepage', 'features', 'feature_2_title', 'Direct Coach Access', 'text', 20),
('homepage', 'features', 'feature_2_description', 'Message your coach anytime through the app. Weekly check-ins, form feedback, and real-time program adjustments.', 'text', 21),
('homepage', 'features', 'feature_2_icon', 'MessageSquare', 'text', 22),
('homepage', 'features', 'feature_3_title', 'Nutrition Coaching', 'text', 30),
('homepage', 'features', 'feature_3_description', 'Personalized macro targets and supplement protocols built by certified dietitians. Adjusted weekly based on your check-ins and progress.', 'text', 31),
('homepage', 'features', 'feature_3_icon', 'Apple', 'text', 32),
('homepage', 'features', 'feature_4_title', 'Progress Tracking', 'text', 40),
('homepage', 'features', 'feature_4_description', 'Log workouts, track personal records, and visualize your gains over time with built-in analytics and progress photos.', 'text', 41),
('homepage', 'features', 'feature_4_icon', 'TrendingUp', 'text', 42),
('homepage', 'features', 'feature_5_title', 'Science-Backed Methods', 'text', 50),
('homepage', 'features', 'feature_5_description', 'Training principles rooted in exercise science and sports medicine. Led by Dr. Hasan Dashti, our protocols are proven and practical.', 'text', 51),
('homepage', 'features', 'feature_5_icon', 'FlaskConical', 'text', 52),
('homepage', 'features', 'feature_6_title', 'Flexible Scheduling', 'text', 60),
('homepage', 'features', 'feature_6_description', 'Train on your schedule with programs that adapt to your life. Morning, evening, or weekend—we make it work.', 'text', 61),
('homepage', 'features', 'feature_6_icon', 'Calendar', 'text', 62);

-- Programs Section (pricing cards)
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order) VALUES
('homepage', 'programs', 'title', 'Choose Your Program', 'text', 0),
('homepage', 'programs', 'subtitle', 'Select the coaching plan that fits your goals and lifestyle', 'text', 1),
-- Team Plan
('homepage', 'programs', 'team_name', 'Team Training', 'text', 10),
('homepage', 'programs', 'team_price', '12', 'number', 11),
('homepage', 'programs', 'team_description', 'Join our structured group training program with periodized programming and community support.', 'text', 12),
('homepage', 'programs', 'team_features', '["Periodized group programming","Access to training community","Weekly workout updates","Exercise library access"]', 'json', 13),
-- 1:1 Online
('homepage', 'programs', 'online_name', '1:1 Online Coaching', 'text', 20),
('homepage', 'programs', 'online_price', '50', 'number', 21),
('homepage', 'programs', 'online_description', 'Fully personalized online coaching with direct access to your coach via our app.', 'text', 22),
('homepage', 'programs', 'online_features', '["Custom training program","Direct coach messaging","Weekly check-ins","Nutrition guidance","Progress tracking"]', 'json', 23),
-- Hybrid
('homepage', 'programs', 'hybrid_name', 'Hybrid Coaching', 'text', 30),
('homepage', 'programs', 'hybrid_price', '175', 'number', 31),
('homepage', 'programs', 'hybrid_description', 'Best of both worlds: Online programming with monthly in-person sessions in Kuwait.', 'text', 32),
('homepage', 'programs', 'hybrid_features', '["Everything in 1:1 Online","Monthly in-person session","Form correction in gym","Equipment optimization"]', 'json', 33),
-- In-Person
('homepage', 'programs', 'inperson_name', 'In-Person Coaching', 'text', 40),
('homepage', 'programs', 'inperson_price', '250', 'number', 41),
('homepage', 'programs', 'inperson_description', 'Premium hands-on coaching with Dr. Iron at our Kuwait facility.', 'text', 42),
('homepage', 'programs', 'inperson_features', '["Weekly in-person sessions","Real-time form coaching","Personalized programming","Priority support","Nutrition protocols"]', 'json', 43);

-- Testimonials Section Headers
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order) VALUES
('homepage', 'testimonials', 'title', 'What Our Clients Say', 'text', 0),
('homepage', 'testimonials', 'subtitle', 'Real results from real people', 'text', 1);

-- Team Section Headers
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order) VALUES
('homepage', 'team', 'title', 'Meet Your Coaches', 'text', 0),
('homepage', 'team', 'subtitle', 'Expert guidance from certified professionals', 'text', 1);

-- CTA Section
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order) VALUES
('homepage', 'cta', 'title', 'Ready to Transform?', 'text', 0),
('homepage', 'cta', 'subtitle', 'Join hundreds of athletes who have elevated their training with IGU coaching.', 'text', 1),
('homepage', 'cta', 'button_text', 'Start Your Journey', 'text', 2);

-- Footer (basic info, supplements existing Footer.tsx)
INSERT INTO public.site_content (page, section, key, value, value_type, sort_order) VALUES
('homepage', 'footer', 'about', 'Intensive Gainz Unit (IGU) is a multidisciplinary coaching and education brand under Dr. Iron International Sports Consultancy. Led by Dr. Hasan Dashti, we integrate medicine, science, and performance to deliver evidence-based training and nutrition systems.', 'text', 0),
('homepage', 'footer', 'copyright', 'Dr. Iron International Sports Consultancy', 'text', 1);

-- ============================================
-- SERVICES PAGE CONTENT
-- ============================================

INSERT INTO public.site_content (page, section, key, value, value_type, sort_order) VALUES
('services', 'hero', 'title', 'Our Coaching Programs', 'text', 0),
('services', 'hero', 'subtitle', 'Find the perfect program for your fitness journey', 'text', 1),
('services', 'team', 'title', 'Team Training', 'text', 0),
('services', 'team', 'subtitle', 'Train with a community of dedicated athletes', 'text', 1),
('services', 'individual', 'title', '1:1 Coaching', 'text', 0),
('services', 'individual', 'subtitle', 'Personalized attention for maximum results', 'text', 1);

-- ============================================
-- MEET OUR TEAM PAGE CONTENT
-- ============================================

INSERT INTO public.site_content (page, section, key, value, value_type, sort_order) VALUES
('meet-our-team', 'hero', 'title', 'Meet Our Team', 'text', 0),
('meet-our-team', 'hero', 'subtitle', 'Expert coaches dedicated to your success', 'text', 1),
('meet-our-team', 'lead', 'title', 'Led by Dr. Hasan Dashti', 'text', 0),
('meet-our-team', 'lead', 'subtitle', 'Sports medicine physician and competitive bodybuilder bringing evidence-based coaching to every client.', 'text', 1);

-- ============================================
-- CALORIE CALCULATOR PAGE CONTENT
-- ============================================

INSERT INTO public.site_content (page, section, key, value, value_type, sort_order) VALUES
('calorie-calculator', 'hero', 'title', 'Calorie Calculator', 'text', 0),
('calorie-calculator', 'hero', 'subtitle', 'Estimate your daily calorie needs based on your goals', 'text', 1),
('calorie-calculator', 'cta', 'title', 'Want Personalized Guidance?', 'text', 0),
('calorie-calculator', 'cta', 'subtitle', 'Our coaches can help you dial in your nutrition with weekly adjustments based on real progress.', 'text', 1),
('calorie-calculator', 'cta', 'button_text', 'View Coaching Programs', 'text', 2);
