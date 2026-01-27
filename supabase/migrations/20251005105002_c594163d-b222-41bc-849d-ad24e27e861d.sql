-- Schedule the payment deadline checker to run daily at 9 AM UTC
SELECT cron.schedule(
  'check-payment-deadlines-daily',
  '0 9 * * *', -- Every day at 9:00 AM UTC
  $$
  SELECT
    net.http_post(
        url:='https://luobvdmetrfutavmbaha.supabase.co/functions/v1/check-payment-deadlines',
        headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1b2J2ZG1ldHJmdXRhdm1iYWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkzMjA0MDUsImV4cCI6MjA3NDg5NjQwNX0.h_r6fLWqKAXP903zeQ39DCPe-xII7aUhRyMu80MGRmI"}'::jsonb,
        body:='{}'::jsonb
    ) as request_id;
  $$
);