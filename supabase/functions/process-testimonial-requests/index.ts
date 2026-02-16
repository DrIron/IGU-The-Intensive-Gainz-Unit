import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_COACHING,
  REPLY_TO_SUPPORT,
  AUTH_REDIRECT_URLS,
} from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, banner, ctaButton, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Testimonial request automation.
 * Called weekly by n8n. Finds clients who have been active for 4-6 weeks
 * and sends a testimonial request email.
 *
 * Criteria:
 * - Subscription status = 'active'
 * - start_date is 28-42 days ago (4-6 weeks)
 * - Haven't already been sent a testimonial request
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
      eligible_clients: 0,
      requests_sent: 0,
      already_sent: 0,
      errors: [] as string[],
    };

    // 4 weeks ago and 6 weeks ago
    const fourWeeksAgo = new Date(
      now.getTime() - 28 * 24 * 60 * 60 * 1000
    ).toISOString();
    const sixWeeksAgo = new Date(
      now.getTime() - 42 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Find active subscriptions that started 4-6 weeks ago
    const { data: eligibleSubs, error: fetchError } = await supabase
      .from("subscriptions")
      .select("id, user_id, start_date, coach_id, services(name)")
      .eq("status", "active")
      .lte("start_date", fourWeeksAgo)
      .gte("start_date", sixWeeksAgo);

    if (fetchError) {
      throw new Error(
        `Failed to fetch eligible subscriptions: ${fetchError.message}`
      );
    }

    if (!eligibleSubs || eligibleSubs.length === 0) {
      console.log("No clients in the 4-6 week window");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    results.eligible_clients = eligibleSubs.length;

    for (const sub of eligibleSubs) {
      try {
        // Get client profile directly from the profiles view
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, first_name")
          .eq("id", sub.user_id)
          .maybeSingle();

        if (!profile?.email) continue;

        // Check if testimonial request was already sent
        const { data: existing } = await supabase
          .from("email_notifications")
          .select("id")
          .eq("user_id", sub.user_id)
          .eq("notification_type", "testimonial_request")
          .maybeSingle();

        if (existing) {
          results.already_sent++;
          continue;
        }

        // Get coach name for personalization
        let coachName = "your coach";
        if (sub.coach_id) {
          const { data: coach } = await supabase
            .from("coaches")
            .select("first_name")
            .eq("user_id", sub.coach_id)
            .maybeSingle();
          if (coach?.first_name) coachName = coach.first_name;
        }

        const firstName = profile.first_name || "there";
        const serviceData = sub.services as any;
        const serviceName = serviceData?.name || "IGU Coaching";
        const testimonialUrl = sub.coach_id
          ? AUTH_REDIRECT_URLS.testimonial(sub.coach_id)
          : `${AUTH_REDIRECT_URLS.dashboard}`;

        const content = [
          greeting(firstName),
          paragraph(`You've been training with <strong>${coachName}</strong> on the <strong>${serviceName}</strong> program for about a month now -- congratulations on your dedication!`),
          paragraph("We'd love to hear about your experience so far. Your feedback helps us improve and helps others discover IGU."),
          banner('Share Your Transformation Story', 'It only takes 2 minutes'),
          ctaButton('Share Your Experience', testimonialUrl),
          paragraph("Whether it's about your progress, your coach, or the platform -- we want to hear it all. Every review makes a difference!"),
          signOff(),
        ].join('');

        const html = wrapInLayout({
          content,
          preheader: `How's your IGU experience so far? We'd love to hear from you.`,
          showUnsubscribe: true,
        });

        const result = await sendEmail({
          from: EMAIL_FROM_COACHING,
          to: profile.email,
          subject: "How's your IGU experience so far?",
          html,
          replyTo: REPLY_TO_SUPPORT,
        });

        await supabase.from("email_notifications").insert({
          user_id: sub.user_id,
          notification_type: "testimonial_request",
          status: result.success ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (result.success) {
          results.requests_sent++;
          console.log(`Sent testimonial request to ${profile.email}`);
        } else {
          results.errors.push(`${profile.email}: testimonial request failed`);
        }
      } catch (err: any) {
        console.error(`Error processing subscription ${sub.id}:`, err);
        results.errors.push(`sub ${sub.id}: ${err.message}`);
      }
    }

    console.log("Testimonial request check completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-testimonial-requests:", error);
    return new Response(
      JSON.stringify({ error: "Testimonial request check failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
