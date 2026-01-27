-- Ensure team_plan_settings table has a default row
INSERT INTO team_plan_settings (is_registration_open, next_program_start_date, announcement_text)
SELECT true, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM team_plan_settings);

-- Add team assignment tracking to subscriptions table
ALTER TABLE subscriptions 
ADD COLUMN IF NOT EXISTS added_to_truecoach_team BOOLEAN DEFAULT false;