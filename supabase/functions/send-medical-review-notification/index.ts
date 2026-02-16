import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { EMAIL_FROM, APP_BASE_URL } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { paragraph, alertBox, detailCard, ctaButton, orderedList, signOff } from '../_shared/emailComponents.ts';
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
    const { userId, firstName, lastName, email, planName } = await req.json();

    if (!userId || !email) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get admin email
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1)
      .maybeSingle();

    if (!adminRole?.user_id) {
      console.error('Admin not found');
      return new Response(
        JSON.stringify({ error: 'Admin not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', adminRole.user_id)
      .single();

    if (!adminProfile?.email) {
      console.error('Admin email not found');
      return new Response(
        JSON.stringify({ error: 'Admin email not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const content = [
      alertBox('<strong>Medical Review Required</strong><br>A new client signup requires medical review and approval based on their PAR-Q responses.', 'warning'),
      paragraph('A client answered "Yes" to one or more PAR-Q questions and requires your approval before proceeding.'),
      detailCard('Client Information', [
        { label: 'Name', value: `${firstName} ${lastName}` },
        { label: 'Email', value: email },
        { label: 'Plan', value: planName },
        { label: 'Status', value: 'Pending Medical Review' },
      ]),
      paragraph('<strong>Next Steps:</strong>'),
      orderedList([
        "Review the client's PAR-Q responses in the admin dashboard",
        'Contact the client if necessary for additional information',
        'Approve to assign to a coach, or reject if medical clearance is needed',
      ]),
      ctaButton('Review in Admin Dashboard', `${APP_BASE_URL}/admin/dashboard`),
      signOff(),
    ].join('');

    const html = wrapInLayout({
      content,
      preheader: `Medical review required for ${firstName} ${lastName} -- PAR-Q flagged`,
    });

    await sendEmail({
      from: EMAIL_FROM,
      to: adminProfile.email,
      subject: `Medical Review Required: ${firstName} ${lastName}`,
      html,
    });

    console.log(`Medical review notification sent to admin for user ${userId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in send-medical-review-notification:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
