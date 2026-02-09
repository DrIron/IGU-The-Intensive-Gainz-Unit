import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EMAIL_FROM, AUTH_REDIRECT_URLS, REPLY_TO_SUPPORT } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Drip sequence for abandoned onboarding.
 * Called daily by n8n. Finds users with stale onboarding_drafts and sends
 * the appropriate nudge email based on how long they've been stalled.
 *
 * Day 1: "You're almost there!"
 * Day 3: "Your spot is waiting"
 * Day 7: "Last chance to join"
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
      drafts_checked: 0,
      emails_sent: 0,
      already_sent: 0,
      skipped_completed: 0,
      skipped_has_subscription: 0,
      errors: [] as string[],
    };

    // Fetch all onboarding drafts that haven't been updated in at least 1 day
    const oneDayAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: staleDrafts, error: fetchError } = await supabase
      .from("onboarding_drafts")
      .select("id, user_id, form_data, current_step, updated_at")
      .lt("updated_at", oneDayAgo);

    if (fetchError) {
      throw new Error(`Failed to fetch onboarding drafts: ${fetchError.message}`);
    }

    if (!staleDrafts || staleDrafts.length === 0) {
      console.log("No stale onboarding drafts found");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    results.drafts_checked = staleDrafts.length;

    for (const draft of staleDrafts) {
      try {
        const updatedAt = new Date(draft.updated_at);
        const daysStale = Math.floor(
          (now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000)
        );

        // Determine which drip step to send
        let notificationType: string | null = null;
        if (daysStale >= 7) {
          notificationType = "abandoned_onboarding_day7";
        } else if (daysStale >= 3) {
          notificationType = "abandoned_onboarding_day3";
        } else if (daysStale >= 1) {
          notificationType = "abandoned_onboarding_day1";
        }

        if (!notificationType) continue;

        // Check if user has already completed onboarding
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, first_name, onboarding_completed_at, status")
          .eq("id", draft.user_id)
          .maybeSingle();

        if (!profile || !profile.email) continue;

        if (profile.onboarding_completed_at) {
          results.skipped_completed++;
          continue;
        }

        // Skip users who already have an active/pending subscription
        const { data: existingSubs } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", draft.user_id)
          .in("status", ["active", "pending"]);

        if (existingSubs && existingSubs.length > 0) {
          results.skipped_has_subscription++;
          continue;
        }

        // Check if this specific notification was already sent
        const { data: existingNotification } = await supabase
          .from("email_notifications")
          .select("id")
          .eq("user_id", draft.user_id)
          .eq("notification_type", notificationType)
          .maybeSingle();

        if (existingNotification) {
          results.already_sent++;
          continue;
        }

        // Build and send the email
        const firstName = profile.first_name || "there";
        const formData = draft.form_data as Record<string, any> | null;
        const serviceName = formData?.selectedService || formData?.service_name;
        const stepLabels = [
          "Service Selection",
          "Personal Info",
          "Health Questionnaire",
          "Coach Preference",
          "Review",
        ];
        const currentStepName =
          stepLabels[draft.current_step] || `Step ${draft.current_step + 1}`;

        const { subject, html } = buildEmail(
          notificationType,
          firstName,
          currentStepName,
          serviceName
        );

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: EMAIL_FROM,
            to: [profile.email],
            subject,
            html,
            reply_to: REPLY_TO_SUPPORT,
          }),
        });

        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error(
            `Failed to send ${notificationType} to ${profile.email}:`,
            errorText
          );
          await supabase.from("email_notifications").insert({
            user_id: draft.user_id,
            notification_type: notificationType,
            status: "failed",
            sent_at: new Date().toISOString(),
          });
          results.errors.push(
            `${profile.email}: ${notificationType} failed`
          );
          continue;
        }

        // Log successful send
        await supabase.from("email_notifications").insert({
          user_id: draft.user_id,
          notification_type: notificationType,
          status: "sent",
          sent_at: new Date().toISOString(),
        });

        results.emails_sent++;
        console.log(
          `Sent ${notificationType} to ${profile.email} (stale ${daysStale} days)`
        );
      } catch (err: any) {
        console.error(`Error processing draft ${draft.id}:`, err);
        results.errors.push(`draft ${draft.id}: ${err.message}`);
      }
    }

    console.log("Abandoned onboarding check completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-abandoned-onboarding:", error);
    return new Response(
      JSON.stringify({ error: "Abandoned onboarding check failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildEmail(
  notificationType: string,
  firstName: string,
  currentStepName: string,
  serviceName?: string
): { subject: string; html: string } {
  const resumeUrl = AUTH_REDIRECT_URLS.onboarding;

  switch (notificationType) {
    case "abandoned_onboarding_day1":
      return {
        subject: "You're almost there!",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                We noticed you started signing up for IGU Coaching but haven't finished yet. You were on <strong>${currentStepName}</strong> — just a few more steps to go!
              </p>

              ${serviceName ? `
              <div style="background-color: #f7fafc; border-left: 4px solid #667eea; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <p style="color: #4a5568; font-size: 14px; margin: 0;">
                  <strong>Your selected program:</strong> ${serviceName}
                </p>
              </div>
              ` : ""}

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                Pick up right where you left off — your progress has been saved.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${resumeUrl}"
                   style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
                  Continue Your Application
                </a>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>The IGU Team</strong>
              </p>
            </div>
            <div style="text-align: center; margin-top: 16px;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                This is an automated message from IGU Coaching
              </p>
            </div>
          </div>
        `,
      };

    case "abandoned_onboarding_day3":
      return {
        subject: "Your spot is waiting",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                We're still holding your spot! You started your IGU Coaching application a few days ago and we'd love to help you get started.
              </p>

              ${serviceName ? `
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
                <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0 0 8px 0;">YOUR SELECTED PROGRAM</p>
                <p style="color: white; font-size: 20px; font-weight: bold; margin: 0;">${serviceName}</p>
              </div>
              ` : ""}

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                You were on <strong>${currentStepName}</strong>. It only takes a few minutes to complete your application and get matched with the perfect coach.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${resumeUrl}"
                   style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
                  Resume Your Application
                </a>
              </div>

              <p style="color: #718096; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                If you have any questions or need help, feel free to reply to this email.
              </p>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>The IGU Team</strong>
              </p>
            </div>
            <div style="text-align: center; margin-top: 16px;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                This is an automated message from IGU Coaching
              </p>
            </div>
          </div>
        `,
      };

    case "abandoned_onboarding_day7":
      return {
        subject: "Last chance to join IGU Coaching",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                It's been a week since you started your IGU Coaching application. We don't want you to miss out!
              </p>

              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.6;">
                  <strong>Your saved progress will be cleared soon.</strong> Complete your application now so you don't have to start over.
                </p>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                You stopped at <strong>${currentStepName}</strong>. Pick up right where you left off — it only takes a few minutes to finish.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${resumeUrl}"
                   style="display: inline-block; background-color: #e53e3e; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(229, 62, 62, 0.3);">
                  Complete Your Application Now
                </a>
              </div>

              <p style="color: #718096; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
                If you've decided IGU isn't for you, no worries — we wish you the best on your fitness journey!
              </p>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>The IGU Team</strong>
              </p>
            </div>
            <div style="text-align: center; margin-top: 16px;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                This is an automated message from IGU Coaching
              </p>
            </div>
          </div>
        `,
      };

    default:
      return { subject: "", html: "" };
  }
}
