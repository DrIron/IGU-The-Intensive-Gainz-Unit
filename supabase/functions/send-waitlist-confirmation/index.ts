import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { EMAIL_FROM } from '../_shared/config.ts';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { banner, greeting, paragraph, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  name: z.string().min(1).max(100).trim(),
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
    const { email, name } = requestSchema.parse(body);

    const content = [
      banner("You're on the List!"),
      greeting(name),
      paragraph("Thank you for joining the IGU waitlist. We're working hard to bring you an exceptional coaching experience."),
      paragraph("We'll send you an invite as soon as spots open up -- stay tuned!"),
      signOff(),
    ].join('');

    const html = wrapInLayout({
      content,
      preheader: "You're on the IGU waitlist -- we'll notify you when spots open.",
    });

    const result = await sendEmail({
      from: EMAIL_FROM,
      to: email,
      subject: "You're on the IGU Waitlist!",
      html,
    });

    console.log('Waitlist confirmation email sent:', result);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error sending waitlist confirmation:', message);
    return new Response(
      JSON.stringify({ error: 'Failed to send confirmation' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
