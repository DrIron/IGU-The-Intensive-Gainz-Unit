import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { AUTH_REDIRECT_URLS, EMAIL_FROM_COACHING } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, ctaButton, alertBox, sectionHeading, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';
import { EMAIL_BRAND } from '../_shared/emailTemplate.ts';

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

function timelineRow(icon: string, label: string, description: string): string {
  return `
    <tr>
      <td style="padding: 8px 12px 8px 0; vertical-align: top; width: 30px; font-size: 16px;">${icon}</td>
      <td style="padding: 8px 0;">
        <strong style="color: ${EMAIL_BRAND.heading}; font-size: 14px;">${label}</strong>
        <br><span style="color: ${EMAIL_BRAND.muted}; font-size: 13px;">${description}</span>
      </td>
    </tr>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { email, name, serviceName, failureReason } = requestSchema.parse(body);

    const content = [
      greeting(name),
      alertBox(`<strong>Your payment for ${serviceName} was unsuccessful.</strong>${failureReason ? `<br>Reason: ${failureReason}` : ''}`, 'error'),
      paragraph('We attempted to process your monthly subscription payment, but it did not go through.'),
      sectionHeading('What happens next?'),
      `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 16px 0;">
        ${timelineRow('&#128197;', 'Days 0-7', 'Your account remains active. You\'ll receive reminders on day 3 and day 5.')}
        ${timelineRow('&#128274;', 'Day 7', 'If payment is not completed, your account will be restricted.')}
        ${timelineRow('&#128233;', 'Days 8-14', 'Additional reminders will be sent while your account is restricted.')}
        ${timelineRow('&#10060;', 'Day 14', 'If payment remains incomplete, your account will be cancelled.')}
      </table>`,
      sectionHeading('Action Required'),
      paragraph('Please update your payment method or complete your payment as soon as possible to avoid service interruption.'),
      ctaButton('Update Payment Method', AUTH_REDIRECT_URLS.billingPay, 'danger'),
      paragraph('If you believe this is an error or need assistance, please contact our support team.'),
      signOff(),
    ].join('');

    const html = wrapInLayout({
      content,
      preheader: 'Your recent payment was unsuccessful. Update your payment method to avoid interruption.',
    });

    const result = await sendEmail({
      from: EMAIL_FROM_COACHING,
      to: email,
      subject: 'Payment Update Needed for Your IGU Subscription',
      html,
    });

    console.log('Payment failed email sent:', result);

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
