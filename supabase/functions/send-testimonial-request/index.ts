import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { AUTH_REDIRECT_URLS, EMAIL_FROM_COACHING } from '../_shared/config.ts';

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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    // Always use production URL for testimonial links
    const testimonialUrl = AUTH_REDIRECT_URLS.testimonial(coachId);

    const html = `
      <h1>Share Your Fitness Journey!</h1>
      <p>Hi ${clientName},</p>
      <p>We hope you're enjoying your training with ${coachName}! We'd love to hear about your experience.</p>
      <p>Your testimonial will help inspire others on their fitness journey and appear on our website.</p>
      <p>Please take a moment to share your thoughts:</p>
      <a href="${testimonialUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0;">
        Leave Your Testimonial
      </a>
      <p>Thank you for being part of our fitness community!</p>
      <p>Best regards,<br>${coachName}<br>Dr Iron Coaching</p>
    `;

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM_COACHING,
        to: [clientEmail],
        subject: `Share Your Fitness Journey with ${coachName}`,
        html,
      }),
    });

    const emailData = await emailResponse.json();
    console.log('Testimonial request email sent:', emailData);

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
