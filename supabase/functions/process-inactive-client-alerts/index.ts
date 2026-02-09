import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EMAIL_FROM_COACHING, REPLY_TO_SUPPORT, APP_BASE_URL } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Inactive client alert to coach.
 * Called daily by n8n. Finds active clients who haven't logged a workout
 * in 5+ days and notifies their coach.
 *
 * Checks:
 * - client_day_modules.completed_at (session completions)
 * - exercise_set_logs.created_at (individual set logs)
 *
 * Sends once per 14-day window to avoid spamming coaches.
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
      active_clients_checked: 0,
      alerts_sent: 0,
      already_sent: 0,
      recently_active: 0,
      errors: [] as string[],
    };

    // Get all active subscriptions with coach info
    const { data: activeSubs, error: fetchError } = await supabase
      .from("subscriptions")
      .select("id, user_id, coach_id, service_id, services(name)")
      .eq("status", "active")
      .not("coach_id", "is", null);

    if (fetchError) {
      throw new Error(`Failed to fetch active subscriptions: ${fetchError.message}`);
    }

    if (!activeSubs || activeSubs.length === 0) {
      console.log("No active subscriptions found");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    results.active_clients_checked = activeSubs.length;

    const fiveDaysAgo = new Date(
      now.getTime() - 5 * 24 * 60 * 60 * 1000
    ).toISOString();

    for (const sub of activeSubs) {
      try {
        // Get client profile directly from the profiles view
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, first_name, last_name")
          .eq("id", sub.user_id)
          .maybeSingle();

        if (!profile) continue;

        // Check for recent workout activity via completed sessions
        const { data: recentSessions } = await supabase
          .from("client_day_modules")
          .select("id")
          .eq("status", "completed")
          .gte("completed_at", fiveDaysAgo)
          .limit(1);

        // We need to filter by user — join through client_program_days → client_programs
        // Instead, check exercise_set_logs which has created_by_user_id
        const { data: recentLogs } = await supabase
          .from("exercise_set_logs")
          .select("id")
          .eq("created_by_user_id", sub.user_id)
          .gte("created_at", fiveDaysAgo)
          .limit(1);

        if ((recentLogs && recentLogs.length > 0)) {
          results.recently_active++;
          continue;
        }

        // Also check direct_calendar_sessions completed recently
        const { data: recentDirect } = await supabase
          .from("direct_calendar_sessions")
          .select("id")
          .eq("client_user_id", sub.user_id)
          .eq("status", "completed")
          .gte("updated_at", fiveDaysAgo)
          .limit(1);

        if (recentDirect && recentDirect.length > 0) {
          results.recently_active++;
          continue;
        }

        // Check if we already sent this alert recently (within 14 days)
        const fourteenDaysAgo = new Date(
          now.getTime() - 14 * 24 * 60 * 60 * 1000
        ).toISOString();

        const { data: recentAlert } = await supabase
          .from("email_notifications")
          .select("id")
          .eq("user_id", sub.user_id)
          .eq("notification_type", "inactive_client_coach_alert")
          .gte("sent_at", fourteenDaysAgo)
          .maybeSingle();

        if (recentAlert) {
          results.already_sent++;
          continue;
        }

        // Get coach details
        const { data: coachProfile } = await supabase
          .from("profiles")
          .select("email, first_name")
          .eq("id", sub.coach_id)
          .maybeSingle();

        if (!coachProfile?.email) continue;

        const clientName =
          `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
          "A client";
        const serviceData = sub.services as any;
        const serviceName = serviceData?.name || "their program";
        const coachFirstName = coachProfile.first_name || "Coach";

        const { subject, html } = buildEmail(
          coachFirstName,
          clientName,
          serviceName
        );

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: EMAIL_FROM_COACHING,
            to: [coachProfile.email],
            subject,
            html,
            reply_to: REPLY_TO_SUPPORT,
          }),
        });

        const emailOk = emailResponse.ok;
        if (!emailOk) {
          const errorText = await emailResponse.text();
          console.error(`Failed to send inactive alert for ${clientName}:`, errorText);
        }

        await supabase.from("email_notifications").insert({
          user_id: sub.user_id,
          notification_type: "inactive_client_coach_alert",
          status: emailOk ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (emailOk) {
          results.alerts_sent++;
          console.log(
            `Sent inactive client alert to ${coachProfile.email} for ${clientName}`
          );
        } else {
          results.errors.push(`${clientName}: alert to coach failed`);
        }
      } catch (err: any) {
        console.error(`Error processing subscription ${sub.id}:`, err);
        results.errors.push(`sub ${sub.id}: ${err.message}`);
      }
    }

    console.log("Inactive client check completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-inactive-client-alerts:", error);
    return new Response(
      JSON.stringify({ error: "Inactive client check failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildEmail(
  coachFirstName: string,
  clientName: string,
  serviceName: string
): { subject: string; html: string } {
  const dashboardUrl = `${APP_BASE_URL}/coach/clients`;

  return {
    subject: `Inactive client: ${clientName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${coachFirstName},</h1>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Your client <strong>${clientName}</strong> hasn't logged a workout in the last 5 days on their <strong>${serviceName}</strong> program.
          </p>

          <div style="background-color: #ebf8ff; border-left: 4px solid #4299e1; padding: 16px; margin: 24px 0; border-radius: 4px;">
            <p style="color: #2b6cb0; font-size: 14px; margin: 0; line-height: 1.6;">
              <strong>Suggested action:</strong> A quick check-in message can make a big difference. Clients who receive proactive outreach are significantly more likely to stay engaged.
            </p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${dashboardUrl}"
               style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
              View My Clients
            </a>
          </div>

          <p style="color: #718096; font-size: 14px; line-height: 1.6;">
            You'll receive this alert at most once every 14 days per client.
          </p>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
            Best regards,<br>
            <strong>The IGU Team</strong>
          </p>
        </div>
        <div style="text-align: center; margin-top: 16px;">
          <p style="color: #a0aec0; font-size: 12px; margin: 0;">
            This is an automated coaching notification from IGU
          </p>
        </div>
      </div>
    `,
  };
}
