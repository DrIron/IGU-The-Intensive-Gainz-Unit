import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { APP_BASE_URL, AUTH_REDIRECT_URLS, EMAIL_FROM_COACHING } from '../_shared/config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  name: z.string().min(1).max(100).trim(),
  serviceName: z.string().min(1).max(200).trim(),
  failureReason: z.string().optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, name, serviceName, failureReason } = requestSchema.parse(body);
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const subject = 'Payment Failed - Action Required';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; }
            .alert-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .timeline { margin: 20px 0; padding-left: 20px; }
            .timeline-item { margin: 10px 0; }
            .button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">⚠️ Payment Failed</h1>
            </div>
            <div class="content">
              <h2>Hi ${name},</h2>
              
              <div class="alert-box">
                <strong>Your payment for ${serviceName} has failed.</strong>
              </div>
              
              <p>We attempted to process your monthly subscription payment, but it was unsuccessful.</p>
              
              ${failureReason ? `<p><strong>Reason:</strong> ${failureReason}</p>` : ''}
              
              <h3>What happens next?</h3>
              <div class="timeline">
                <div class="timeline-item">📅 <strong>Days 0-7:</strong> Your account remains active. You'll receive reminders on day 3 and day 5.</div>
                <div class="timeline-item">🔒 <strong>Day 7:</strong> If payment is not completed, your account will be restricted.</div>
                <div class="timeline-item">📧 <strong>Days 8-14:</strong> Additional reminders will be sent while your account is restricted.</div>
                <div class="timeline-item">❌ <strong>Day 14:</strong> If payment remains incomplete, your account will be cancelled.</div>
              </div>
              
              <h3>Action Required</h3>
              <p>Please update your payment method or complete your payment as soon as possible to avoid service interruption.</p>
              
              <p>To update your payment details, please log in to your account:</p>
              
              <a href="${AUTH_REDIRECT_URLS.auth}" class="button">Update Payment Method</a>
              
              <p>If you believe this is an error or need assistance, please contact our support team immediately.</p>
              
              <p>Thank you,<br><strong>The IGU Team</strong></p>
            </div>
            <div class="footer">
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
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
        from: EMAIL_FROM_COACHING,
        to: [email],
        subject,
        html,
      }),
    });

    const emailData = await emailResponse.json();
    console.log('Payment failed email sent:', emailData);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending payment failed email:', error);
    return new Response(
      JSON.stringify({ error: "Failed to send email" }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
