import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

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

    // Send email notification to admin
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
          body: JSON.stringify({
            from: 'Dr Iron <noreply@mail.theigu.com>',
            to: [adminProfile.email],
            subject: '[Dr Iron Coaching] Medical Review Required - New Client Signup',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Medical Review Required</h1>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                A new client signup requires medical review and approval.
              </p>
              
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 30px 0;">
                <h2 style="color: #333; font-size: 18px; margin-bottom: 15px;">Client Information</h2>
                <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Name:</strong> ${firstName} ${lastName}</p>
                <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Email:</strong> ${email}</p>
                <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Plan:</strong> ${planName}</p>
                <p style="color: #666; font-size: 14px; margin: 5px 0;"><strong>Status:</strong> Pending Medical Review</p>
              </div>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                This client answered "Yes" to one or more PAR-Q questions and requires your approval before proceeding.
              </p>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                Please log in to the admin dashboard to review the PAR-Q responses and approve or reject this client.
              </p>
              
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin: 30px 0;">
                <h3 style="color: #333; font-size: 16px; margin-bottom: 10px;">Next Steps</h3>
                <ol style="color: #666; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                  <li>Review the client's PAR-Q responses in the admin dashboard</li>
                  <li>Contact the client if necessary for additional information</li>
                  <li>Approve to assign to a coach, or reject if medical clearance is needed</li>
                </ol>
              </div>
              
              <p style="color: #666; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>Dr. Iron Fitness System</strong>
              </p>
            </div>
          `,
        }),
      });
    }

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
