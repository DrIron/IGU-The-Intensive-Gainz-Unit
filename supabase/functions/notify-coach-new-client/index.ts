import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { EMAIL_FROM } from '../_shared/config.ts';

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

    // Send email notification
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [contactInfo.email],
          subject: 'New Client Assigned',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">New Client Assigned</h1>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                Hi ${coach.first_name},
              </p>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                You have been assigned a new client!
              </p>
              
              <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h2 style="color: #333; font-size: 18px; margin-bottom: 15px;">Client Details</h2>
                <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Name:</strong> ${clientName}</p>
                <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Plan:</strong> ${planName}</p>
                <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Status:</strong> Active</p>
              </div>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                You can view and manage this client from your coach dashboard.
              </p>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>The IGU Team</strong>
              </p>
            </div>
          `,
        }),
      });
    }

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
