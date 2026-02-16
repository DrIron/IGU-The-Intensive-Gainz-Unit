import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_BILLING,
  EMAIL_FROM_COACHING,
  AUTH_REDIRECT_URLS,
  REPLY_TO_SUPPORT,
} from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, alertBox, ctaButton, detailCard, banner, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

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

    const now = new Date();
    const results = {
      subscriptions_checked: 0,
      client_emails_sent: 0,
      coach_emails_sent: 0,
      already_sent: 0,
      errors: [] as string[],
    };

    // Fetch all failed subscriptions with service data
    const { data: failedSubs, error: fetchError } = await supabase
      .from("subscriptions")
      .select("id, user_id, payment_failed_at, coach_id, service_id, services(name)")
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
        // Get client profile directly from the profiles view
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, first_name, last_name, status")
          .eq("id", sub.user_id)
          .maybeSingle();

        if (!profile?.email) continue;

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
            const { subject, preheader, content } = buildCoachNotification(
              coachFirstName,
              clientName,
              serviceName,
              daysSinceFailure
            );

            const html = wrapInLayout({ content, preheader });

            const emailResult = await sendEmail({
              from: EMAIL_FROM_COACHING,
              to: coachProfile.email,
              subject,
              html,
              replyTo: REPLY_TO_SUPPORT,
            });

            await supabase.from("email_notifications").insert({
              user_id: sub.user_id,
              notification_type: step.type,
              status: emailResult.success ? "sent" : "failed",
              sent_at: new Date().toISOString(),
            });

            if (emailResult.success) {
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
            const { subject, preheader, content } = buildClientEmail(
              step.type,
              firstName,
              serviceName,
              daysSinceFailure
            );

            const html = wrapInLayout({ content, preheader });

            const emailResult = await sendEmail({
              from: EMAIL_FROM_BILLING,
              to: profile.email,
              subject,
              html,
              replyTo: REPLY_TO_SUPPORT,
            });

            await supabase.from("email_notifications").insert({
              user_id: sub.user_id,
              notification_type: step.type,
              status: emailResult.success ? "sent" : "failed",
              sent_at: new Date().toISOString(),
            });

            if (emailResult.success) {
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

function buildClientEmail(
  notificationType: string,
  firstName: string,
  serviceName: string,
  daysSinceFailure: number
): { subject: string; preheader: string; content: string } {
  const paymentUrl = AUTH_REDIRECT_URLS.billingPay;

  switch (notificationType) {
    case "payment_failure_day1":
      return {
        subject: "We noticed a payment issue",
        preheader: `Your payment for ${serviceName} didn't go through -- here's how to fix it.`,
        content: [
          greeting(firstName),
          paragraph(`We tried to process your monthly payment for <strong>${serviceName}</strong>, but it didn't go through. This can happen for a number of reasons -- an expired card, insufficient funds, or a temporary bank issue.`),
          paragraph("No worries -- your access is still active. Just update your payment method when you get a chance and everything will be sorted."),
          ctaButton('Update Payment Method', paymentUrl),
          paragraph('If you believe this is an error, please reach out and we\'ll help sort it out.'),
          signOff(),
        ].join(''),
      };

    case "payment_failure_day2":
      return {
        subject: "Quick reminder -- update your payment method",
        preheader: `Your payment for ${serviceName} still needs to be updated.`,
        content: [
          greeting(firstName),
          paragraph(`Just a quick follow-up -- your payment for <strong>${serviceName}</strong> still needs to be updated. Your access continues for now, so there's no interruption to your training.`),
          alertBox('<strong>Your access is still active.</strong> Update your payment method to keep things running smoothly.', 'info'),
          ctaButton('Update Payment Method', paymentUrl),
          signOff(),
        ].join(''),
      };

    case "payment_failure_day9":
      return {
        subject: "We don't want to lose you",
        preheader: `Your ${serviceName} subscription needs attention -- account cancellation in ~5 days.`,
        content: [
          greeting(firstName),
          paragraph(`We really don't want to lose you as a member. Your payment for <strong>${serviceName}</strong> has been outstanding for ${daysSinceFailure} days, and your account access is currently restricted.`),
          banner('Account cancellation in ~5 days', 'Update your payment now to restore full access immediately'),
          paragraph("Your coach and program are still here waiting for you. One quick payment update and you're back on track."),
          ctaButton('Restore My Access Now', paymentUrl, 'danger'),
          paragraph("If you're experiencing financial difficulties or have questions, please reply to this email. We're happy to discuss options."),
          signOff(),
        ].join(''),
      };

    default:
      return { subject: "", preheader: "", content: "" };
  }
}

function buildCoachNotification(
  coachFirstName: string,
  clientName: string,
  serviceName: string,
  daysSinceFailure: number
): { subject: string; preheader: string; content: string } {
  return {
    subject: `Payment issue: ${clientName}`,
    preheader: `${clientName}'s payment for ${serviceName} failed ${daysSinceFailure} days ago.`,
    content: [
      greeting(coachFirstName),
      paragraph(`This is a heads-up that your client <strong>${clientName}</strong> has a payment issue with their <strong>${serviceName}</strong> subscription.`),
      alertBox(`<strong>Payment failed ${daysSinceFailure} days ago.</strong><br>The client has been notified and reminded to update their payment method. No action is required from you, but you may want to check in with them during your next session.`, 'warning'),
      paragraph("If the payment isn't resolved within 14 days, the client's account will be automatically cancelled."),
      signOff(),
    ].join(''),
  };
}
