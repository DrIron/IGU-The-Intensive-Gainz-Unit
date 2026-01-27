import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { EMAIL_FROM_BILLING, REPLY_TO_SUPPORT, APP_BASE_URL } from "../_shared/config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  name: z.string().min(1).max(100).trim(),
  daysRemaining: z.number().int().min(1).max(30),
  stage: z.enum(['approved_waiting_payment', 'active_grace']).optional(),
  coachName: z.string().optional(),
  serviceName: z.string().optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, name, daysRemaining, stage, coachName, serviceName } = requestSchema.parse(body);
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    const dashboardUrl = `${APP_BASE_URL}/billing/pay`;
    
    let subject = '';
    let html = '';

    if (stage === 'approved_waiting_payment') {
      // Client has been approved by coach but hasn't paid yet
      subject = daysRemaining === 1 
        ? '⏰ Final Day: Complete Your Payment to Start Training!'
        : `Reminder: Complete Payment to Begin with ${coachName || 'Your Coach'}`;

      html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
              <h1 style="color: #2d3748; font-size: 26px; margin: 0 0 8px 0;">
                ${daysRemaining === 1 ? '⏰ Final Day!' : '🔔 Payment Reminder'}
              </h1>
              <div style="width: 60px; height: 4px; background: linear-gradient(90deg, #f59e0b, #ef4444); margin: 0 auto; border-radius: 2px;"></div>
            </div>
            
            <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
              Hi ${name},
            </p>
            
            <div style="background: ${daysRemaining === 1 ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'}; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
              <p style="color: white; font-size: 18px; font-weight: bold; margin: 0 0 8px 0;">
                ${daysRemaining === 1 
                  ? 'This is your last day to complete payment!' 
                  : `You have ${daysRemaining} days left to complete payment`}
              </p>
              <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0;">
                ${coachName ? `${coachName} is ready to start your training!` : 'Your coach is waiting to get started!'}
              </p>
            </div>
            
            ${coachName || serviceName ? `
            <div style="background-color: #f7fafc; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <h2 style="color: #2d3748; font-size: 18px; margin: 0 0 16px 0;">📋 Your Program</h2>
              <div style="border-left: 3px solid #4CAF50; padding-left: 16px;">
                ${coachName ? `<p style="color: #4a5568; font-size: 14px; margin: 8px 0;"><strong>Coach:</strong> ${coachName}</p>` : ''}
                ${serviceName ? `<p style="color: #4a5568; font-size: 14px; margin: 8px 0;"><strong>Program:</strong> ${serviceName}</p>` : ''}
              </div>
            </div>
            ` : ''}
            
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; padding: 16px; margin: 24px 0;">
              <h3 style="color: #856404; font-size: 16px; margin: 0 0 8px 0;">
                ${daysRemaining === 1 ? '⚠️ Payment Required Today' : '⏰ Action Required'}
              </h3>
              <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.5;">
                ${daysRemaining === 1 
                  ? 'If payment is not completed today, your spot will be released and you\'ll need to restart the signup process.'
                  : `Complete your payment within ${daysRemaining} days to secure your spot. After this deadline, your account will expire and you'll need to restart the signup process.`}
              </p>
            </div>
            
            <div style="text-align: center; margin: 32px 0 24px 0;">
              <a href="${dashboardUrl}" 
                 style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
                Complete Payment Now →
              </a>
            </div>
            
            <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 32px;">
              <p style="color: #718096; font-size: 14px; line-height: 1.6; margin: 0;">
                If you have any questions or need assistance, please don't hesitate to reach out to us.
              </p>
              <p style="color: #4a5568; font-size: 16px; margin: 16px 0 0 0;">
                Best regards,<br>
                <strong style="color: #2d3748;">Dr. Iron Fitness Team</strong>
              </p>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 16px;">
            <p style="color: #a0aec0; font-size: 12px; margin: 0;">
              This is an automated reminder about your pending payment
            </p>
          </div>
        </div>
      `;
    } else {
      // Default reminder for active grace period (existing functionality)
      subject = daysRemaining === 1 
        ? 'Final Reminder: Complete Your Payment Today'
        : `Payment Reminder: ${daysRemaining} Days Remaining`;

      html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2d3748; font-size: 24px;">Hi ${name},</h1>
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
            This is a friendly reminder to complete your payment for your Dr. Iron Fitness coaching subscription.
          </p>
          <p style="color: #e53e3e; font-size: 18px; font-weight: bold;">
            You have ${daysRemaining} day${daysRemaining > 1 ? 's' : ''} remaining to complete your payment.
          </p>
          <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
            If you don't complete payment within ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}, your account will be automatically expired and you'll need to restart the signup process.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${dashboardUrl}" 
               style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Complete Payment Now
            </a>
          </div>
          <p style="color: #718096; font-size: 14px;">
            If you have any questions, please don't hesitate to reach out to our support team.
          </p>
          <p style="color: #4a5568; font-size: 16px;">
            Best regards,<br>
            <strong>Dr. Iron Fitness Team</strong>
          </p>
        </div>
      `;
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM_BILLING,
        to: [email],
        subject,
        html,
        reply_to: REPLY_TO_SUPPORT,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Error sending payment reminder:', errorText);
      throw new Error(`Failed to send email: ${errorText}`);
    }

    const emailData = await emailResponse.json();
    console.log('Payment reminder sent:', emailData);

    return new Response(
      JSON.stringify({ success: true, emailId: emailData.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending payment reminder:', error);
    return new Response(
      JSON.stringify({ error: "Failed to send reminder", message: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
