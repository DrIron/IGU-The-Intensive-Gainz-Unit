import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { EMAIL_FROM_COACHING } from '../_shared/config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface NotificationRequest {
  email: string;
  name: string;
  planName: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name, planName }: NotificationRequest = await req.json();
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = `
      <h1>Welcome to ${planName}, ${name}!</h1>
      <p>Congratulations! Your payment has been successfully processed and your account is now active.</p>
      
      <h2>Next Steps:</h2>
      <p>You will be added to True Coach within the next 48 hours. Please follow these steps:</p>
      <ol>
        <li>Download the <strong>True Coach app</strong> from the App Store or Google Play Store</li>
        <li>Watch for an invitation email from True Coach</li>
        <li>Set up your True Coach account using the invitation</li>
        <li>Start your fitness journey!</li>
      </ol>
      
      <h2>Important:</h2>
      <p>If you have not been added to True Coach within 48 hours, please contact IGU directly.</p>
      
      <p>We're excited to have you as part of our community!</p>
      
      <p>Best regards,<br>The IGU Team</p>
    `;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM_COACHING,
        to: [email],
        subject: `Welcome to ${planName} - True Coach Setup Instructions`,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error('Resend API error:', errorData);
      throw new Error(`Failed to send email: ${errorData}`);
    }

    const emailData = await emailResponse.json();
    console.log('True Coach notification sent:', emailData);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending True Coach notification:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
