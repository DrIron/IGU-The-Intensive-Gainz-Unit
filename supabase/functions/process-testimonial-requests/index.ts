import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_COACHING,
  REPLY_TO_SUPPORT,
  AUTH_REDIRECT_URLS,
} from "../_shared/config.ts";

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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

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
      .select(
        `
        id,
        user_id,
        start_date,
        coach_id,
        profiles!subscriptions_user_id_fkey(id, email, first_name),
        services(name)
      `
      )
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
        const profileData = sub.profiles as any;
        if (!profileData || Array.isArray(profileData)) continue;

        const profile = profileData as {
          id: string;
          email: string;
          first_name: string | null;
        };

        if (!profile.email) continue;

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
            .select("name")
            .eq("user_id", sub.coach_id)
            .maybeSingle();
          if (coach?.name) coachName = coach.name;
        }

        const firstName = profile.first_name || "there";
        const serviceData = sub.services as any;
        const serviceName = serviceData?.name || "IGU Coaching";
        const testimonialUrl = sub.coach_id
          ? AUTH_REDIRECT_URLS.testimonial(sub.coach_id)
          : `${AUTH_REDIRECT_URLS.dashboard}`;

        const { subject, html } = buildEmail(
          firstName,
          coachName,
          serviceName,
          testimonialUrl
        );

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: EMAIL_FROM_COACHING,
            to: [profile.email],
            subject,
            html,
            reply_to: REPLY_TO_SUPPORT,
          }),
        });

        const emailOk = emailResponse.ok;
        if (!emailOk) {
          const errorText = await emailResponse.text();
          console.error(
            `Failed to send testimonial request to ${profile.email}:`,
            errorText
          );
        }

        await supabase.from("email_notifications").insert({
          user_id: sub.user_id,
          notification_type: "testimonial_request",
          status: emailOk ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (emailOk) {
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

function buildEmail(
  firstName: string,
  coachName: string,
  serviceName: string,
  testimonialUrl: string
): { subject: string; html: string } {
  return {
    subject: "How's your IGU experience so far?",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            You've been training with <strong>${coachName}</strong> on the <strong>${serviceName}</strong> program for about a month now — congratulations on your dedication!
          </p>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            We'd love to hear about your experience so far. Your feedback helps us improve and helps others discover IGU Coaching.
          </p>

          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0 0 8px 0;">IT ONLY TAKES 2 MINUTES</p>
            <p style="color: white; font-size: 18px; font-weight: bold; margin: 0;">Share your transformation story</p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${testimonialUrl}"
               style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
              Share Your Experience
            </a>
          </div>

          <p style="color: #718096; font-size: 14px; line-height: 1.6;">
            Whether it's about your progress, your coach, or the platform — we want to hear it all. Every review makes a difference!
          </p>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
            Keep crushing it,<br>
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
}
