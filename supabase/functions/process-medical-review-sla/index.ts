import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/sendEmail.ts";
import { wrapInLayout } from "../_shared/emailTemplate.ts";
import {
  greeting,
  paragraph,
  alertBox,
  ctaButton,
  signOff,
} from "../_shared/emailComponents.ts";
import {
  EMAIL_FROM_ADMIN,
  EMAIL_FROM,
  REPLY_TO_SUPPORT,
  APP_BASE_URL,
} from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SLA_HOURS = 4;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Find pending medical reviews older than SLA_HOURS
    const cutoff = new Date(Date.now() - SLA_HOURS * 60 * 60 * 1000).toISOString();

    const { data: pendingReviews, error: reviewsError } = await supabase
      .from("medical_reviews")
      .select("id, user_id, flagged_at")
      .eq("status", "pending")
      .lt("flagged_at", cutoff);

    if (reviewsError) {
      console.error("Error fetching medical reviews:", reviewsError);
      return new Response(
        JSON.stringify({ error: reviewsError.message }),
        { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    if (!pendingReviews || pendingReviews.length === 0) {
      return new Response(
        JSON.stringify({ message: "No overdue medical reviews", processed: 0 }),
        { headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    let adminNotified = 0;
    let clientNotified = 0;

    for (const review of pendingReviews) {
      const hoursAgo = Math.round(
        (Date.now() - new Date(review.flagged_at).getTime()) / (1000 * 60 * 60),
      );

      // Get user profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, first_name")
        .eq("id", review.user_id)
        .maybeSingle();

      if (!profile?.email) continue;

      // Check dedup - don't send same notification type within 24h
      const dedupKey = `medical_review_sla_${review.id}`;
      const { data: existingNotification } = await supabase
        .from("email_notifications")
        .select("id")
        .eq("notification_type", dedupKey)
        .gt("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .maybeSingle();

      if (existingNotification) continue;

      // Send admin notification
      const adminContent =
        alertBox(
          `Medical review for <strong>${profile.first_name || "a client"}</strong> has been pending for ${hoursAgo} hours (SLA: ${SLA_HOURS}h).`,
          "warning",
        ) +
        paragraph(`User ID: ${review.user_id}`) +
        paragraph(`Flagged at: ${new Date(review.flagged_at).toLocaleString()}`) +
        ctaButton("Review Now", `${APP_BASE_URL}/admin/medical-reviews`);

      const adminHtml = wrapInLayout({
        content: adminContent,
        preheader: `PAR-Q review overdue -- ${hoursAgo}h pending`,
      });

      // Get admin emails
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (admins && admins.length > 0) {
        for (const admin of admins) {
          const { data: adminProfile } = await supabase
            .from("profiles")
            .select("email")
            .eq("id", admin.user_id)
            .maybeSingle();

          if (adminProfile?.email) {
            await sendEmail({
              from: EMAIL_FROM_ADMIN,
              to: adminProfile.email,
              subject: `PAR-Q Review Overdue -- ${profile.first_name || "Client"} (${hoursAgo}h)`,
              html: adminHtml,
            });
            adminNotified++;
          }
        }
      }

      // Send client reassurance email
      const clientContent =
        greeting(profile.first_name || "there") +
        paragraph(
          "We wanted to let you know that our team is actively reviewing your health questionnaire. Your safety is our top priority, and we want to make sure everything is in order before we match you with a coach.",
        ) +
        alertBox(
          "Your review is in progress. You can expect to hear from us soon.",
          "info",
        ) +
        paragraph(
          "If you have any additional health information to share or questions about the process, don't hesitate to reach out.",
        ) +
        ctaButton("Contact Support", `mailto:${REPLY_TO_SUPPORT}`, "secondary") +
        signOff();

      const clientHtml = wrapInLayout({
        content: clientContent,
        preheader: "Your health review is in progress",
      });

      await sendEmail({
        from: EMAIL_FROM,
        to: profile.email,
        subject: "Your Health Review Is in Progress -- IGU",
        html: clientHtml,
        replyTo: REPLY_TO_SUPPORT,
      });
      clientNotified++;

      // Record dedup
      await supabase.from("email_notifications").insert({
        user_id: review.user_id,
        notification_type: dedupKey,
        sent_at: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({
        message: "SLA check complete",
        overdue_reviews: pendingReviews.length,
        admin_notifications: adminNotified,
        client_notifications: clientNotified,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  } catch (error) {
    console.error("Medical review SLA error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } },
    );
  }
});
