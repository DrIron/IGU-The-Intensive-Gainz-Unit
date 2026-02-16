import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { AUTH_REDIRECT_URLS, EMAIL_FROM_COACHING } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, banner, ctaButton, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  clientEmail: z.string().email().max(255).trim().toLowerCase(),
  clientName: z.string().min(1).max(100).trim(),
  coachId: z.string().uuid(),
  coachName: z.string().min(1).max(100).trim(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { clientEmail, clientName, coachId, coachName } = requestSchema.parse(body);

    // Always use production URL for testimonial links
    const testimonialUrl = AUTH_REDIRECT_URLS.testimonial(coachId);

    const content = [
      greeting(clientName.split(' ')[0] || clientName),
      paragraph(`We hope you're enjoying your training with <strong>${coachName}</strong>! We'd love to hear about your experience.`),
      paragraph('Your testimonial will help inspire others on their fitness journey and appear on our website.'),
      banner('Share Your Fitness Journey', 'It only takes 2 minutes'),
      ctaButton('Leave Your Testimonial', testimonialUrl),
      paragraph('Thank you for being part of the IGU community!'),
      signOff(),
    ].join('');

    const html = wrapInLayout({
      content,
      preheader: `How's training going with ${coachName}? We'd love to hear from you.`,
      showUnsubscribe: true,
    });

    const result = await sendEmail({
      from: EMAIL_FROM_COACHING,
      to: clientEmail,
      subject: `How's training going? We'd love to hear`,
      html,
    });

    if (!result.success) {
      console.error('Failed to send testimonial request:', result.error);
      return new Response(
        JSON.stringify({ error: "Failed to send testimonial request" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Testimonial request email sent:', result.id);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error sending testimonial request:', error);
    return new Response(
      JSON.stringify({ error: "Failed to send testimonial request" }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
