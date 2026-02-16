import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { EMAIL_FROM_IGU, APP_BASE_URL } from '../_shared/config.ts';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, ctaButton, alertBox, orderedList, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

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

  // Rate limit: 5 requests per minute per IP
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip, 5, 60_000);
  if (!rateCheck.allowed) {
    return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
  }

  try {
    const body = await req.json();
    const { email, name, passwordResetLink, isManualClient } = requestSchema.parse(body);

    let content: string;
    let preheader: string;

    if (passwordResetLink) {
      preheader = 'Set your password to get started with IGU.';
      content = [
        greeting(name),
        paragraph(isManualClient
          ? "You've been added as a client on IGU. We're excited to help you achieve your fitness goals!"
          : "Thank you for signing up for IGU. We're excited to help you achieve your fitness goals!"
        ),
        paragraph('<strong>Get Started:</strong> Click the button below to set your password and access your account.'),
        ctaButton('Set Your Password', passwordResetLink),
        alertBox('This link expires in 24 hours for security. After setting your password, you can complete your onboarding and start your fitness journey.', 'info'),
        signOff(),
      ].join('');
    } else {
      preheader = 'Welcome to IGU — here are your next steps.';
      content = [
        greeting(name),
        paragraph("Thank you for signing up for IGU. We're excited to help you achieve your fitness goals!"),
        paragraph('<strong>Next Steps:</strong>'),
        orderedList([
          'Complete your onboarding questionnaire',
          'Review and sign required documents',
          'Get matched with your coach',
          'Start your fitness journey!',
        ]),
        ctaButton('Go to Dashboard', `${APP_BASE_URL}/dashboard`),
        signOff(),
      ].join('');
    }

    const html = wrapInLayout({ content, preheader });

    const result = await sendEmail({
      from: EMAIL_FROM_IGU,
      to: email,
      subject: 'Welcome to IGU -- Your Account is Ready',
      html,
    });

    console.log('Signup confirmation email sent:', result);

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
