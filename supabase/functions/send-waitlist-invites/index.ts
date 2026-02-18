import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { EMAIL_FROM, APP_BASE_URL } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { banner, greeting, paragraph, ctaButton, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin role from the auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Create client with user's JWT to check their role
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role client for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all uninvited waitlist leads
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, email, name')
      .eq('source', 'waitlist')
      .is('invited_at', null);

    if (leadsError) {
      throw new Error(`Failed to fetch leads: ${leadsError.message}`);
    }

    if (!leads || leads.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, failed: 0, errors: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    const sentIds: string[] = [];

    for (const lead of leads) {
      const displayName = lead.name || 'there';

      const content = [
        banner("You're Invited!"),
        greeting(displayName),
        paragraph("Great news -- spots are now open at IGU! As a waitlist member, you're among the first to get access."),
        paragraph("Create your account today and start your fitness journey with our expert coaching team."),
        ctaButton('Create Your Account', `${APP_BASE_URL}/auth?tab=signup`),
        paragraph("We can't wait to help you reach your goals."),
        signOff(),
      ].join('');

      const html = wrapInLayout({
        content,
        preheader: 'Your invite to IGU is here -- create your account now.',
      });

      const result = await sendEmail({
        from: EMAIL_FROM,
        to: lead.email,
        subject: "You're Invited to IGU -- Create Your Account",
        html,
      });

      if (result.success) {
        sent++;
        sentIds.push(lead.id);
      } else {
        failed++;
        errors.push(`${lead.email}: ${result.error}`);
      }
    }

    // Mark successfully invited leads
    if (sentIds.length > 0) {
      const { error: updateError } = await supabase
        .from('leads')
        .update({ invited_at: new Date().toISOString() })
        .in('id', sentIds);

      if (updateError) {
        console.error('Failed to update invited_at:', updateError);
        errors.push(`DB update error: ${updateError.message}`);
      }
    }

    console.log(`Waitlist invites: sent=${sent}, failed=${failed}`);

    return new Response(
      JSON.stringify({ sent, failed, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending waitlist invites:', message);
    return new Response(
      JSON.stringify({ error: 'Failed to send invites' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
