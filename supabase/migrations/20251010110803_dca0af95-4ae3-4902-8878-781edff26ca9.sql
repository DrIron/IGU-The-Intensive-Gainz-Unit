-- Schedule the recurring payments to run daily at 9 AM
SELECT cron.schedule(
  'process-recurring-payments-daily',
  '0 9 * * *', -- Every day at 9 AM
  $$
  SELECT
    net.http_post(
        url:='https://luobvdmetrfutavmbaha.supabase.co/functions/v1/process-recurring-payments',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1b2J2ZG1ldHJmdXRhdW1iYWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMjA0MDUsImV4cCI6MjA3NDg5NjQwNX0.h_r6fLWqKAXP903zeQ39DCPe-xII7aUhRyMu80MGRmI"}'::jsonb,
        body:=concat('{"scheduled_run": "', now(), '"}')::jsonb
    ) AS request_id;
  $$
);