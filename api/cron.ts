const ALLOWED_FUNCTIONS = [
  'send-admin-daily-summary',
  'send-weekly-coach-digest',
  'process-renewal-reminders',
  'process-coach-inactivity-monitor',
  'process-testimonial-requests',
  'process-referral-reminders',
  'process-payment-failure-drip',
  'process-abandoned-onboarding',
  'process-inactive-client-alerts',
  'process-lead-nurture',
] as const;

export default async function handler(req: Request): Promise<Response> {
  // Validate cron secret
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Extract function name from query param
  const url = new URL(req.url);
  const fn = url.searchParams.get('fn');

  if (!fn || !ALLOWED_FUNCTIONS.includes(fn as any)) {
    return new Response(`Invalid function: ${fn}`, { status: 400 });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY', { status: 500 });
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `Failed to call ${fn}: ${error}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
