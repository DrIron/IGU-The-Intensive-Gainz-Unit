import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AUTH_REDIRECT_URLS, EMAIL_FROM_COACHING } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, ctaButton, alertBox, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  coachId: z.string().uuid(),
  coachEmail: z.string().email().max(255).trim().toLowerCase(),
  coachName: z.string().min(1).max(100).trim(),
  isNewUser: z.boolean().optional(),
  coachStatus: z.enum(['pending','active']).optional(),
  passwordResetLink: z.string().url().optional().nullable(),
});

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { coachId, coachEmail, coachName, isNewUser, coachStatus, passwordResetLink } = requestSchema.parse(body);

    const isPending = coachStatus === 'pending';
    const coachSignupUrl = AUTH_REDIRECT_URLS.coachSignup(coachId);

    // Ensure we have a password reset link (generate if missing)
    let effectiveResetLink: string | null = passwordResetLink ?? null;
    if (!effectiveResetLink) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const redirectTo = AUTH_REDIRECT_URLS.coachPasswordSetup(coachId);
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: coachEmail,
          options: { redirectTo },
        });
        if (!linkError) {
          effectiveResetLink = linkData?.properties?.action_link || null;
        } else {
          console.error('Failed to generate recovery link in send-coach-invitation:', linkError);
        }
      } catch (e) {
        console.error('Error generating recovery link in send-coach-invitation:', e);
      }
    }

    let subject: string;
    let preheader: string;
    let content: string;

    if (effectiveResetLink) {
      subject = 'Welcome to IGU -- Set Your Password';
      preheader = 'Set your password to access your IGU coach profile.';
      content = [
        greeting(coachName),
        paragraph("You've been added as a coach to the IGU team. We're excited to have you on board!"),
        paragraph('Click the button below to set your password and complete your coach profile:'),
        ctaButton('Set Password & Complete Profile', effectiveResetLink),
        alertBox('This link expires in 24 hours for security. After setting your password, you can add your professional details, certifications, and experience.', 'info'),
        signOff(),
      ].join('');
    } else {
      subject = isPending
        ? 'Complete Your Coach Profile - IGU'
        : 'Welcome to the IGU Coaching Team';
      preheader = isPending
        ? 'Your coach account is pending. Complete your profile to get started.'
        : 'Your coach account has been updated.';
      content = [
        greeting(coachName),
        paragraph(isPending
          ? 'Your coach account is pending. Please sign in and complete your profile to get started.'
          : 'Your coach account has been updated.'
        ),
        ctaButton(isPending ? 'Complete Your Profile' : 'View Your Profile', coachSignupUrl),
        paragraph(isPending
          ? 'After signing in, you can add your professional details, certifications, and experience.'
          : 'You can update your professional details, certifications, and experience.'
        ),
        signOff(),
      ].join('');
    }

    const html = wrapInLayout({ content, preheader });

    const result = await sendEmail({
      from: EMAIL_FROM_COACHING,
      to: coachEmail,
      subject,
      html,
    });

    console.log("Coach invitation email sent successfully:", result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending coach invitation:", error);
    return new Response(
      JSON.stringify({ error: "Failed to send invitation" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
