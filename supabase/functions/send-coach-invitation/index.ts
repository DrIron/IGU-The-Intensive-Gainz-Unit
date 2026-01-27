import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AUTH_REDIRECT_URLS, EMAIL_FROM_COACHING } from '../_shared/config.ts';

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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const isPending = coachStatus === 'pending';
    // Always use production URL for coach signup links
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
        // Always use production URL for password setup redirect
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

    const subject = isPending 
      ? 'Complete Your Coach Profile - Dr Iron Fitness'
      : 'Welcome to Dr Iron Fitness Coaching Team';
    
    const html = effectiveResetLink ? `
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
              <h1 style="margin: 0 0 20px 0; color: #333; font-size: 24px;">Welcome to Dr Iron Fitness, ${coachName}!</h1>
              <p style="margin: 0 0 15px 0; color: #666; font-size: 16px;">You've been added as a coach to the Dr Iron Fitness team.</p>
              <p style="margin: 0 0 15px 0; color: #666; font-size: 16px;"><strong>Get Started:</strong></p>
              <p style="margin: 0 0 20px 0; color: #666; font-size: 16px;">Click the button below to set your password and complete your coach profile:</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${effectiveResetLink}" style="background-color: #4F46E5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">Set Password & Complete Profile</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0 10px 0; color: #999; font-size: 14px;">This secure link will allow you to create your password. After setting your password, you'll be able to add your professional details, certifications, and experience.</p>
              <p style="margin: 10px 0 0 0; color: #999; font-size: 14px;"><strong>Note:</strong> This link expires in 24 hours for security.</p>
              <p style="margin: 30px 0 0 0; color: #666; font-size: 16px;">Best regards,<br>The Dr Iron Fitness Team</p>
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
              <h1 style="margin: 0 0 20px 0; color: #333; font-size: 24px;">${isPending ? 'Complete Your Coach Profile' : 'Welcome back'}, ${coachName}!</h1>
              <p style="margin: 0 0 20px 0; color: #666; font-size: 16px;">${isPending ? 'Your coach account is pending. Please sign in and complete your profile to get started.' : 'Your coach account has been updated.'}</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${coachSignupUrl}" style="background-color: #4F46E5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">${isPending ? 'Complete Your Profile' : 'View Your Profile'}</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 20px 0 0 0; color: #666; font-size: 16px;">${isPending ? 'After signing in, you can add your professional details, certifications, and experience.' : 'You can update your professional details, certifications, and experience.'}</p>
              <p style="margin: 30px 0 0 0; color: #666; font-size: 16px;">Best regards,<br>The Dr Iron Fitness Team</p>
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
        from: EMAIL_FROM_COACHING,
        to: [coachEmail],
        subject: subject,
        html,
      }),
    });

    const emailData = await emailResponse.json();
    console.log("Coach invitation email sent successfully:", emailData);

    return new Response(JSON.stringify(emailData), {
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
