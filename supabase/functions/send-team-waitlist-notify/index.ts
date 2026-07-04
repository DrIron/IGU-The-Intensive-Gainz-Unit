import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { EMAIL_FROM, APP_BASE_URL } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { banner, greeting, paragraph, ctaButton, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

// Notify one team_waitlist entry that a spot opened. Called fire-and-forget by the head coach's
// "Notify" action (which also stamps notified_at via the mark_team_waitlist_notified RPC). This
// fn just sends the email — but authorizes the caller as the team's head coach (or admin) first so
// it can't be used to spam arbitrary waitlist addresses. Deploy with --no-verify-jwt (internal
// JWT validation; gateway rejects ES256).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { waitlistId } = await req.json();
    if (!waitlistId) {
      return new Response(JSON.stringify({ error: 'Missing waitlistId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: entry } = await supabase
      .from('team_waitlist')
      .select('id, email, user_id, team_id')
      .eq('id', waitlistId)
      .maybeSingle();
    if (!entry) {
      return new Response(JSON.stringify({ error: 'Waitlist entry not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: team } = await supabase
      .from('coach_teams')
      .select('id, name, coach_id')
      .eq('id', entry.team_id)
      .maybeSingle();
    if (!team) {
      return new Response(JSON.stringify({ error: 'Team not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Authorize: team's head coach OR admin.
    let authorized = team.coach_id === user.id;
    if (!authorized) {
      const { data: roleData } = await supabase
        .from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      authorized = !!roleData;
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Not authorised for this team' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let displayName = 'there';
    if (entry.user_id) {
      const { data: p } = await supabase
        .from('profiles_public').select('first_name, display_name').eq('id', entry.user_id).maybeSingle();
      displayName = p?.display_name || p?.first_name || 'there';
    }

    const content = [
      banner('A spot just opened!'),
      greeting(displayName),
      paragraph(`Good news -- a spot has opened on ${team.name} at IGU. You're off the waitlist and can join now.`),
      ctaButton('Join the team', `${APP_BASE_URL}/auth?tab=signup`),
      paragraph("Spots fill fast -- grab yours while it's available."),
      signOff(),
    ].join('');
    const html = wrapInLayout({ content, preheader: `A spot opened on ${team.name} -- join now.` });

    const result = await sendEmail({
      from: EMAIL_FROM,
      to: entry.email,
      subject: `A spot opened on ${team.name} -- join now`,
      html,
    });

    return new Response(JSON.stringify({ sent: result.success, error: result.success ? undefined : result.error }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending team waitlist notify:', message);
    return new Response(JSON.stringify({ error: 'Failed to send notification' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
