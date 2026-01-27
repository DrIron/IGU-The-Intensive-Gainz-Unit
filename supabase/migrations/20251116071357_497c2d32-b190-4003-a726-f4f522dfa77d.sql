-- Add cron job to clean up incomplete signups daily at 3 AM UTC
-- This will delete accounts that are:
-- 1. Status = 'pending'
-- 2. Created more than 48 hours ago
-- 3. No onboarding completion
-- 4. No subscription

-- Note: pg_cron extension should already be enabled in Supabase projects
-- Create a cron job to run cleanup-incomplete-signups every day at 3 AM UTC
SELECT cron.schedule(
  'cleanup-incomplete-signups-daily',
  '0 3 * * *', -- Every day at 3 AM UTC
  $$
  SELECT
    net.http_post(
      url := (SELECT current_setting('app.settings.supabase_url') || '/functions/v1/cleanup-incomplete-signups'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT current_setting('app.settings.service_role_key'))
      ),
      body := '{}'::jsonb
    ) AS request_id;
  $$
);

-- Create app settings if they don't exist (for storing URL and key)
-- Note: These would typically be set via Supabase CLI or dashboard
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'your-supabase-url';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';