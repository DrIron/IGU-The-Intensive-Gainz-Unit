import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { EMAIL_FROM, APP_BASE_URL } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, detailCard, ctaButton, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { coachUserId, clientUserId, clientName, planName } = await req.json();

    if (!coachUserId || !clientUserId) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get coach basic info from coaches table
    const { data: coach } = await supabase
      .from('coaches')
      .select('id, first_name')
      .eq('user_id', coachUserId)
      .single();

    if (!coach) {
      console.error('Coach not found');
      return new Response(
        JSON.stringify({ error: 'Coach not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get coach email from coaches_private table (server-side access only)
    const { data: contactInfo } = await supabase
      .from('coaches_private')
      .select('email')
      .eq('coach_public_id', coach.id)
      .maybeSingle();

    if (!contactInfo?.email) {
      console.error('Coach email not found in coaches_private');
      return new Response(
        JSON.stringify({ error: 'Coach contact information not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const content = [
      greeting(coach.first_name),
      paragraph('You have been assigned a new client!'),
      detailCard('Client Details', [
        { label: 'Name', value: clientName },
        { label: 'Plan', value: planName },
        { label: 'Status', value: 'Active' },
      ]),
      paragraph('You can view and manage this client from your coach dashboard.'),
      ctaButton('View Client', `${APP_BASE_URL}/dashboard`),
      signOff(),
    ].join('');

    const html = wrapInLayout({
      content,
      preheader: `New client assigned: ${clientName} -- ${planName}`,
    });

    await sendEmail({
      from: EMAIL_FROM,
      to: contactInfo.email,
      subject: `New Client: ${clientName} -- ${planName}`,
      html,
    });

    console.log(`Notification sent to coach ${coachUserId} for new client ${clientUserId}`);

    // Return success but do NOT include email in response
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in notify-coach-new-client:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
