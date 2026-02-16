import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EMAIL_FROM, AUTH_REDIRECT_URLS, REPLY_TO_SUPPORT } from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, alertBox, ctaButton, detailCard, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

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

        const { subject, preheader, content } = buildEmailContent(
          notificationType,
          firstName,
          currentStepName,
          serviceName
        );

        const html = wrapInLayout({
          content,
          preheader,
          showUnsubscribe: true,
        });

        const result = await sendEmail({
          from: EMAIL_FROM,
          to: profile.email,
          subject,
          html,
          replyTo: REPLY_TO_SUPPORT,
        });

        await supabase.from("email_notifications").insert({
          user_id: draft.user_id,
          notification_type: notificationType,
          status: result.success ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (result.success) {
          results.emails_sent++;
          console.log(
            `Sent ${notificationType} to ${profile.email} (stale ${daysStale} days)`
          );
        } else {
          results.errors.push(
            `${profile.email}: ${notificationType} failed`
          );
        }
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

function buildEmailContent(
  notificationType: string,
  firstName: string,
  currentStepName: string,
  serviceName?: string
): { subject: string; preheader: string; content: string } {
  const resumeUrl = AUTH_REDIRECT_URLS.onboarding;

  const serviceSection = serviceName
    ? detailCard('Your Selected Program', [{ label: 'Program', value: serviceName }])
    : '';

  switch (notificationType) {
    case "abandoned_onboarding_day1":
      return {
        subject: "You're almost there -- finish your IGU application",
        preheader: `You were on ${currentStepName} -- just a few more steps to go!`,
        content: [
          greeting(firstName),
          paragraph(`We noticed you started signing up for IGU but haven't finished yet. You were on <strong>${currentStepName}</strong> -- just a few more steps to go!`),
          serviceSection,
          paragraph('Pick up right where you left off -- your progress has been saved.'),
          ctaButton('Continue Your Application', resumeUrl),
          signOff(),
        ].join(''),
      };

    case "abandoned_onboarding_day3":
      return {
        subject: "Your spot is waiting at IGU",
        preheader: `We're still holding your spot! Complete your application in a few minutes.`,
        content: [
          greeting(firstName),
          paragraph("We're still holding your spot! You started your IGU application a few days ago and we'd love to help you get started."),
          serviceSection,
          paragraph(`You were on <strong>${currentStepName}</strong>. It only takes a few minutes to complete your application and get matched with the perfect coach.`),
          ctaButton('Resume Your Application', resumeUrl),
          paragraph('If you have any questions or need help, feel free to reply to this email.'),
          signOff(),
        ].join(''),
      };

    case "abandoned_onboarding_day7":
      return {
        subject: "Last chance to join IGU",
        preheader: "Your saved progress will be cleared soon -- complete your application now.",
        content: [
          greeting(firstName),
          paragraph("It's been a week since you started your IGU application. We don't want you to miss out!"),
          alertBox('<strong>Your saved progress will be cleared soon.</strong> Complete your application now so you don\'t have to start over.', 'warning'),
          paragraph(`You stopped at <strong>${currentStepName}</strong>. Pick up right where you left off -- it only takes a few minutes to finish.`),
          ctaButton('Complete Your Application Now', resumeUrl, 'danger'),
          paragraph("If you've decided IGU isn't for you, no worries -- we wish you the best on your fitness journey!"),
          signOff(),
        ].join(''),
      };

    default:
      return { subject: "", preheader: "", content: "" };
  }
}
