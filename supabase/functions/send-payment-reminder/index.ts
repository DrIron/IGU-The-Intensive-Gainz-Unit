import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { EMAIL_FROM_BILLING, REPLY_TO_SUPPORT, APP_BASE_URL } from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, ctaButton, alertBox, detailCard, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

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

    const dashboardUrl = `${APP_BASE_URL}/billing/pay`;
    const isUrgent = daysRemaining === 1;

    let subject: string;
    let preheader: string;
    let content: string;

    if (stage === 'approved_waiting_payment') {
      subject = isUrgent
        ? 'Final Day: Complete Your Payment to Start Training'
        : `Reminder: Complete Payment to Begin with ${coachName || 'Your Coach'}`;
      preheader = isUrgent
        ? 'This is your last day to complete payment before your spot is released.'
        : `You have ${daysRemaining} days left to complete your payment.`;

      const detailItems = [];
      if (coachName) detailItems.push({ label: 'Coach', value: coachName });
      if (serviceName) detailItems.push({ label: 'Program', value: serviceName });

      content = [
        greeting(name),
        paragraph(isUrgent
          ? 'This is your <strong>last day</strong> to complete your payment and secure your spot.'
          : `You have <strong>${daysRemaining} days</strong> left to complete your payment and start training.`
        ),
        paragraph(coachName
          ? `${coachName} is ready to start your training!`
          : 'Your coach is waiting to get started!'
        ),
        detailItems.length > 0 ? detailCard('Your Program', detailItems) : '',
        alertBox(
          isUrgent
            ? '<strong>Payment Required Today</strong><br>If payment is not completed today, your spot will be released and you\'ll need to restart the signup process.'
            : `<strong>Action Required</strong><br>Complete your payment within ${daysRemaining} days to secure your spot. After this deadline, your account will expire and you'll need to restart the signup process.`,
          isUrgent ? 'error' : 'warning'
        ),
        ctaButton('Complete Payment Now', dashboardUrl),
        signOff(),
      ].join('');
    } else {
      subject = isUrgent
        ? 'Final Reminder: Complete Your Payment Today'
        : `Payment Reminder: ${daysRemaining} Days Remaining`;
      preheader = `You have ${daysRemaining} day${daysRemaining > 1 ? 's' : ''} remaining to complete your payment.`;

      content = [
        greeting(name),
        paragraph('This is a friendly reminder to complete your payment for your IGU coaching subscription.'),
        alertBox(
          `<strong>You have ${daysRemaining} day${daysRemaining > 1 ? 's' : ''} remaining</strong> to complete your payment. If you don't complete payment in time, your account will be automatically expired and you'll need to restart the signup process.`,
          isUrgent ? 'error' : 'warning'
        ),
        ctaButton('Complete Payment Now', dashboardUrl),
        paragraph('If you have any questions, please don\'t hesitate to reach out to our support team.'),
        signOff(),
      ].join('');
    }

    const html = wrapInLayout({ content, preheader });

    const result = await sendEmail({
      from: EMAIL_FROM_BILLING,
      to: email,
      subject,
      html,
      replyTo: REPLY_TO_SUPPORT,
    });

    if (!result.success) {
      throw new Error(`Failed to send email: ${result.error}`);
    }

    console.log('Payment reminder sent:', result.id);

    return new Response(
      JSON.stringify({ success: true, emailId: result.id }),
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
