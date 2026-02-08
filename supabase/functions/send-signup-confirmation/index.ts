import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { EMAIL_FROM_IGU } from '../_shared/config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  name: z.string().min(1).max(100).trim(),
  passwordResetLink: z.string().url().optional(),
  isManualClient: z.boolean().optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, name, passwordResetLink, isManualClient } = requestSchema.parse(body);
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const html = passwordResetLink ? `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; padding: 40px;">
          <tr>
            <td>
              <h1 style="margin: 0 0 20px 0; color: #333; font-size: 24px;">Welcome to IGU, ${name}!</h1>
              <p style="margin: 0 0 15px 0; color: #666; font-size: 16px;">${isManualClient ? 'You have been added as a client by an admin.' : 'Thank you for signing up for IGU.'} We're excited to help you achieve your fitness goals!</p>
              <p style="margin: 0 0 15px 0; color: #666; font-size: 16px;"><strong>Get Started:</strong></p>
              <p style="margin: 0 0 20px 0; color: #666; font-size: 16px;">Click the button below to set your password and access your account:</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${passwordResetLink}" style="background-color: #4F46E5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">Set Your Password</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0 10px 0; color: #999; font-size: 14px;">After setting your password, you'll be able to complete your onboarding and start your fitness journey.</p>
              <p style="margin: 10px 0 0 0; color: #999; font-size: 14px;"><strong>Note:</strong> This link expires in 24 hours for security.</p>
              <p style="margin: 30px 0 0 0; color: #666; font-size: 16px;">Best regards,<br>The IGU Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    ` : `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; padding: 40px;">
          <tr>
            <td>
              <h1 style="margin: 0 0 20px 0; color: #333; font-size: 24px;">Welcome to IGU, ${name}!</h1>
              <p style="margin: 0 0 15px 0; color: #666; font-size: 16px;">Thank you for signing up for IGU. We're excited to help you achieve your fitness goals!</p>
              <p style="margin: 0 0 15px 0; color: #666; font-size: 16px;"><strong>Next Steps:</strong></p>
              <ol style="margin: 0 0 20px 0; color: #666; font-size: 16px; padding-left: 20px;">
                <li style="margin-bottom: 10px;">Complete your onboarding questionnaire</li>
                <li style="margin-bottom: 10px;">Review and sign required documents</li>
                <li style="margin-bottom: 10px;">Get matched with your coach</li>
                <li>Start your fitness journey!</li>
              </ol>
              <p style="margin: 20px 0 0 0; color: #666; font-size: 16px;">Best regards,<br>The IGU Team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM_IGU,
        to: [email],
        subject: 'Welcome to IGU - Account Created Successfully!',
        html,
      }),
    });

    const emailData = await emailResponse.json();
    console.log('Signup confirmation email sent:', emailData);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending signup confirmation:', error);
    return new Response(
      JSON.stringify({ error: "Failed to send confirmation" }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
