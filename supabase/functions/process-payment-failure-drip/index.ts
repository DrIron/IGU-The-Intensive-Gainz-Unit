import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_BILLING,
  EMAIL_FROM_COACHING,
  AUTH_REDIRECT_URLS,
  REPLY_TO_SUPPORT,
} from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Extended payment failure drip sequence.
 * Called daily by n8n. Complements the existing check-payment-deadlines function
 * with additional touchpoints and coach notifications.
 *
 * Day 1: Soft "we noticed an issue" email to client
 * Day 2: Quick reminder to client
 * Day 5: Coach notification about client's payment issue
 * Day 9: Urgent "we don't want to lose you" to client
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
      subscriptions_checked: 0,
      client_emails_sent: 0,
      coach_emails_sent: 0,
      already_sent: 0,
      errors: [] as string[],
    };

    // Fetch all failed subscriptions with profile + service + coach data
    const { data: failedSubs, error: fetchError } = await supabase
      .from("subscriptions")
      .select(
        `
        id,
        user_id,
        payment_failed_at,
        coach_id,
        service_id,
        profiles(id, email, first_name, last_name, status),
        services(name)
      `
      )
      .eq("status", "failed")
      .not("payment_failed_at", "is", null);

    if (fetchError) {
      throw new Error(
        `Failed to fetch failed subscriptions: ${fetchError.message}`
      );
    }

    if (!failedSubs || failedSubs.length === 0) {
      console.log("No failed subscriptions found");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    results.subscriptions_checked = failedSubs.length;

    for (const sub of failedSubs) {
      try {
        const profileData = sub.profiles as any;
        if (!profileData || Array.isArray(profileData)) continue;

        const profile = profileData as {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          status: string;
        };

        if (!profile.email) continue;

        const failedAt = new Date(sub.payment_failed_at);
        const daysSinceFailure = Math.floor(
          (now.getTime() - failedAt.getTime()) / (24 * 60 * 60 * 1000)
        );

        const serviceData = sub.services as any;
        const serviceName = serviceData?.name || "your coaching program";
        const clientName =
          `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
          "there";
        const firstName = profile.first_name || "there";

        // Determine which drip steps apply
        const dripSteps: {
          day: number;
          type: string;
          recipient: "client" | "coach";
        }[] = [
          { day: 1, type: "payment_failure_day1", recipient: "client" },
          { day: 2, type: "payment_failure_day2", recipient: "client" },
          { day: 5, type: "payment_failure_coach_notify", recipient: "coach" },
          { day: 9, type: "payment_failure_day9", recipient: "client" },
        ];

        for (const step of dripSteps) {
          if (daysSinceFailure < step.day) continue;

          // Check if this notification was already sent
          const { data: existing } = await supabase
            .from("email_notifications")
            .select("id")
            .eq("user_id", sub.user_id)
            .eq("notification_type", step.type)
            .maybeSingle();

          if (existing) {
            results.already_sent++;
            continue;
          }

          if (step.recipient === "coach") {
            // Send coach notification
            if (!sub.coach_id) continue;

            const { data: coach } = await supabase
              .from("coaches")
              .select("user_id, first_name, last_name")
              .eq("user_id", sub.coach_id)
              .maybeSingle();

            if (!coach) continue;

            // Get coach email from profiles
            const { data: coachProfile } = await supabase
              .from("profiles")
              .select("email")
              .eq("id", sub.coach_id)
              .maybeSingle();

            if (!coachProfile?.email) continue;

            const coachFirstName = coach.first_name || "Coach";
            const { subject, html } = buildCoachNotificationEmail(
              coachFirstName,
              clientName,
              serviceName,
              daysSinceFailure
            );

            const emailOk = await sendEmail(
              resendApiKey,
              EMAIL_FROM_COACHING,
              coachProfile.email,
              subject,
              html
            );

            await supabase.from("email_notifications").insert({
              user_id: sub.user_id,
              notification_type: step.type,
              status: emailOk ? "sent" : "failed",
              sent_at: new Date().toISOString(),
            });

            if (emailOk) {
              results.coach_emails_sent++;
              console.log(
                `Sent ${step.type} to coach ${coachProfile.email} for client ${profile.email}`
              );
            } else {
              results.errors.push(
                `${coachProfile.email}: ${step.type} failed`
              );
            }
          } else {
            // Send client notification
            const { subject, html } = buildClientEmail(
              step.type,
              firstName,
              serviceName,
              daysSinceFailure
            );

            const emailOk = await sendEmail(
              resendApiKey,
              EMAIL_FROM_BILLING,
              profile.email,
              subject,
              html
            );

            await supabase.from("email_notifications").insert({
              user_id: sub.user_id,
              notification_type: step.type,
              status: emailOk ? "sent" : "failed",
              sent_at: new Date().toISOString(),
            });

            if (emailOk) {
              results.client_emails_sent++;
              console.log(
                `Sent ${step.type} to ${profile.email} (day ${daysSinceFailure})`
              );
            } else {
              results.errors.push(`${profile.email}: ${step.type} failed`);
            }
          }
        }
      } catch (err: any) {
        console.error(`Error processing subscription ${sub.id}:`, err);
        results.errors.push(`sub ${sub.id}: ${err.message}`);
      }
    }

    console.log("Payment failure drip check completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-payment-failure-drip:", error);
    return new Response(
      JSON.stringify({ error: "Payment failure drip check failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function sendEmail(
  apiKey: string,
  from: string,
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
        reply_to: REPLY_TO_SUPPORT,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Resend API error: ${errorText}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Email send error:", err);
    return false;
  }
}

function buildClientEmail(
  notificationType: string,
  firstName: string,
  serviceName: string,
  daysSinceFailure: number
): { subject: string; html: string } {
  const paymentUrl = AUTH_REDIRECT_URLS.billingPay;

  switch (notificationType) {
    case "payment_failure_day1":
      return {
        subject: "We noticed a payment issue",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                We tried to process your monthly payment for <strong>${serviceName}</strong>, but it didn't go through. This can happen for a number of reasons — an expired card, insufficient funds, or a temporary bank issue.
              </p>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                No worries — your access is still active. Just update your payment method when you get a chance and everything will be sorted.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${paymentUrl}"
                   style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
                  Update Payment Method
                </a>
              </div>

              <p style="color: #718096; font-size: 14px; line-height: 1.6;">
                If you believe this is an error, please reach out and we'll help sort it out.
              </p>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>The IGU Team</strong>
              </p>
            </div>
            <div style="text-align: center; margin-top: 16px;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                This is an automated billing notification from IGU
              </p>
            </div>
          </div>
        `,
      };

    case "payment_failure_day2":
      return {
        subject: "Quick reminder: Update your payment method",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                Just a quick follow-up — your payment for <strong>${serviceName}</strong> still needs to be updated. Your access continues for now, so there's no interruption to your training.
              </p>

              <div style="background-color: #ebf8ff; border-left: 4px solid #4299e1; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <p style="color: #2b6cb0; font-size: 14px; margin: 0; line-height: 1.6;">
                  <strong>Your access is still active.</strong> Update your payment method to keep things running smoothly.
                </p>
              </div>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${paymentUrl}"
                   style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
                  Update Payment Method
                </a>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>The IGU Team</strong>
              </p>
            </div>
            <div style="text-align: center; margin-top: 16px;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                This is an automated billing notification from IGU
              </p>
            </div>
          </div>
        `,
      };

    case "payment_failure_day9":
      return {
        subject: "We don't want to lose you",
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                We really don't want to lose you as a member. Your payment for <strong>${serviceName}</strong> has been outstanding for ${daysSinceFailure} days, and your account access is currently restricted.
              </p>

              <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
                <p style="color: white; font-size: 18px; font-weight: bold; margin: 0 0 8px 0;">
                  Account cancellation in ~5 days
                </p>
                <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0;">
                  Update your payment now to restore full access immediately
                </p>
              </div>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                Your coach and program are still here waiting for you. One quick payment update and you're back on track.
              </p>

              <div style="text-align: center; margin: 32px 0;">
                <a href="${paymentUrl}"
                   style="display: inline-block; background-color: #e53e3e; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(229, 62, 62, 0.3);">
                  Restore My Access Now
                </a>
              </div>

              <p style="color: #718096; font-size: 14px; line-height: 1.6;">
                If you're experiencing financial difficulties or have questions, please reply to this email. We're happy to discuss options.
              </p>

              <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
                Best regards,<br>
                <strong>The IGU Team</strong>
              </p>
            </div>
            <div style="text-align: center; margin-top: 16px;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                This is an automated billing notification from IGU
              </p>
            </div>
          </div>
        `,
      };

    default:
      return { subject: "", html: "" };
  }
}

function buildCoachNotificationEmail(
  coachFirstName: string,
  clientName: string,
  serviceName: string,
  daysSinceFailure: number
): { subject: string; html: string } {
  return {
    subject: `Payment issue: ${clientName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${coachFirstName},</h1>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            This is a heads-up that your client <strong>${clientName}</strong> has a payment issue with their <strong>${serviceName}</strong> subscription.
          </p>

          <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin: 24px 0; border-radius: 4px;">
            <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.6;">
              <strong>Payment failed ${daysSinceFailure} days ago.</strong><br>
              The client has been notified and reminded to update their payment method. No action is required from you, but you may want to check in with them during your next session.
            </p>
          </div>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            If the payment isn't resolved within 14 days, the client's account will be automatically cancelled.
          </p>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
            Best regards,<br>
            <strong>The IGU Team</strong>
          </p>
        </div>
        <div style="text-align: center; margin-top: 16px;">
          <p style="color: #a0aec0; font-size: 12px; margin: 0;">
            This is an automated notification from IGU
          </p>
        </div>
      </div>
    `,
  };
}
