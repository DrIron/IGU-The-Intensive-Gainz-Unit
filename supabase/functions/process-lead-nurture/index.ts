import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM,
  REPLY_TO_SUPPORT,
  AUTH_REDIRECT_URLS,
  APP_BASE_URL,
} from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Lead nurture drip sequence.
 * Called daily by n8n. Follows up on newsletter signups (leads table)
 * who haven't converted to users.
 *
 * Day 2: "Here's what IGU can do for you" (value proposition)
 * Day 5: "Meet our coaches" (social proof)
 * Day 10: "Limited-time offer" (urgency)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const now = new Date();
    const results = {
      leads_checked: 0,
      emails_sent: 0,
      already_sent: 0,
      already_converted: 0,
      errors: [] as string[],
    };

    // Fetch unconverted leads older than 1 day
    const oneDayAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: leads, error: fetchError } = await supabase
      .from("leads")
      .select("id, email, name, source, created_at, converted_to_user_id")
      .is("converted_to_user_id", null)
      .lt("created_at", oneDayAgo);

    if (fetchError) {
      throw new Error(`Failed to fetch leads: ${fetchError.message}`);
    }

    if (!leads || leads.length === 0) {
      console.log("No unconverted leads found");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    results.leads_checked = leads.length;

    for (const lead of leads) {
      try {
        // Double-check the lead hasn't signed up (check auth.users by email)
        const { data: existingUser } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", lead.email)
          .maybeSingle();

        if (existingUser) {
          // Mark as converted
          await supabase
            .from("leads")
            .update({
              converted_to_user_id: existingUser.id,
              converted_at: new Date().toISOString(),
            })
            .eq("id", lead.id);
          results.already_converted++;
          continue;
        }

        const createdAt = new Date(lead.created_at);
        const daysSinceSignup = Math.floor(
          (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)
        );

        // Determine which drip step to send
        let notificationType: string | null = null;
        if (daysSinceSignup >= 10) {
          notificationType = "lead_nurture_day10";
        } else if (daysSinceSignup >= 5) {
          notificationType = "lead_nurture_day5";
        } else if (daysSinceSignup >= 2) {
          notificationType = "lead_nurture_day2";
        }

        if (!notificationType) continue;

        // Check if already sent (use lead email as key since they don't have user_id)
        const { data: existing } = await supabase
          .from("email_notifications")
          .select("id")
          .eq("notification_type", notificationType)
          .eq("user_id", lead.id)
          .maybeSingle();

        if (existing) {
          results.already_sent++;
          continue;
        }

        const firstName = lead.name?.split(" ")[0] || "there";
        const { subject, html } = buildEmail(notificationType, firstName);

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: [lead.email],
            subject,
            html,
            reply_to: REPLY_TO_SUPPORT,
          }),
        });

        const emailOk = emailResponse.ok;
        if (!emailOk) {
          const errorText = await emailResponse.text();
          console.error(
            `Failed to send ${notificationType} to ${lead.email}:`,
            errorText
          );
        }

        // Use lead.id as user_id for dedup (leads don't have auth user_ids)
        await supabase.from("email_notifications").insert({
          user_id: lead.id,
          notification_type: notificationType,
          status: emailOk ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (emailOk) {
          results.emails_sent++;
          console.log(
            `Sent ${notificationType} to ${lead.email} (day ${daysSinceSignup})`
          );
        } else {
          results.errors.push(`${lead.email}: ${notificationType} failed`);
        }
      } catch (err: any) {
        console.error(`Error processing lead ${lead.id}:`, err);
        results.errors.push(`lead ${lead.id}: ${err.message}`);
      }
    }

    console.log("Lead nurture check completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-lead-nurture:", error);
    return new Response(
      JSON.stringify({ error: "Lead nurture check failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildEmail(
  notificationType: string,
  firstName: string
): { subject: string; html: string } {
  const servicesUrl = AUTH_REDIRECT_URLS.services;
  const teamUrl = `${APP_BASE_URL}/meet-our-team`;
  const signupUrl = `${AUTH_REDIRECT_URLS.auth}?tab=signup`;

  switch (notificationType) {
    case "lead_nurture_day2":
      return {
        subject: "Here's what IGU Coaching can do for you",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                Thanks for signing up for updates from IGU! We wanted to share what makes our coaching different.
              </p>

              <div style="margin: 24px 0;">
                <div style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                  <p style="color: #2d3748; font-size: 15px; margin: 0;"><strong>Personalized Programs</strong> — Every workout is built specifically for your goals and experience level</p>
                </div>
                <div style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                  <p style="color: #2d3748; font-size: 15px; margin: 0;"><strong>Expert Coaches</strong> — Work 1:1 with certified coaches who specialize in your goals</p>
                </div>
                <div style="padding: 12px 0; border-bottom: 1px solid #e2e8f0;">
                  <p style="color: #2d3748; font-size: 15px; margin: 0;"><strong>Full Tracking</strong> — Log workouts, track progress, and see real results over time</p>
                </div>
                <div style="padding: 12px 0;">
                  <p style="color: #2d3748; font-size: 15px; margin: 0;"><strong>Nutrition Support</strong> — Optional dietitian-led nutrition coaching for complete results</p>
                </div>
              </div>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${servicesUrl}"
                   style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
                  Explore Our Programs
                </a>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>The IGU Team</strong>
              </p>
            </div>
            <div style="text-align: center; margin-top: 16px;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                You're receiving this because you signed up at theigu.com
              </p>
            </div>
          </div>
        `,
      };

    case "lead_nurture_day5":
      return {
        subject: "Meet the coaches behind IGU",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                The right coach makes all the difference. At IGU, every coach is hand-picked and brings real expertise to help you reach your goals.
              </p>

              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
                <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0 0 8px 0;">OUR TEAM</p>
                <p style="color: white; font-size: 18px; font-weight: bold; margin: 0;">Certified coaches specializing in bodybuilding, powerlifting, nutrition & more</p>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                When you sign up, we'll match you with the coach who best fits your goals, training style, and schedule.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${teamUrl}"
                   style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
                  Meet Our Coaches
                </a>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>The IGU Team</strong>
              </p>
            </div>
            <div style="text-align: center; margin-top: 16px;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                You're receiving this because you signed up at theigu.com
              </p>
            </div>
          </div>
        `,
      };

    case "lead_nurture_day10":
      return {
        subject: "Ready to start your transformation?",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                We know choosing a coaching program is a big decision. That's why we make it easy to get started — no long-term contracts, cancel anytime.
              </p>

              <div style="background-color: #f0fff4; border-left: 4px solid #48bb78; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <p style="color: #276749; font-size: 14px; margin: 0; line-height: 1.6;">
                  <strong>Plans start from just 12 KWD/month</strong> for team coaching. 1:1 online coaching with a dedicated personal coach starts at 50 KWD/month.
                </p>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                The onboarding takes just a few minutes — we'll ask about your goals, match you with the perfect coach, and get your first program ready.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${signupUrl}"
                   style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
                  Start Your Journey
                </a>
              </div>

              <p style="color: #718096; font-size: 14px; line-height: 1.6;">
                Have questions? Simply reply to this email and we'll be happy to help.
              </p>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>The IGU Team</strong>
              </p>
            </div>
            <div style="text-align: center; margin-top: 16px;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                You're receiving this because you signed up at theigu.com
              </p>
            </div>
          </div>
        `,
      };

    default:
      return { subject: "", html: "" };
  }
}
