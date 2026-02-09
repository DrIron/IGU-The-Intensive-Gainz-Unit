import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_COACHING,
  REPLY_TO_SUPPORT,
  APP_BASE_URL,
} from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Weekly coach digest email.
 * Called Monday mornings by n8n. Sends each active coach a summary of
 * their clients' activity over the past week.
 *
 * Includes:
 * - Total active clients
 * - Workouts completed this week (across all clients)
 * - Clients with no activity this week
 * - New clients assigned this week
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
      coaches_processed: 0,
      digests_sent: 0,
      errors: [] as string[],
    };

    const oneWeekAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Get all active coaches
    const { data: coaches, error: coachError } = await supabase
      .from("coaches")
      .select("user_id, first_name, last_name")
      .in("status", ["active", "approved"]);

    if (coachError) {
      throw new Error(`Failed to fetch coaches: ${coachError.message}`);
    }

    if (!coaches || coaches.length === 0) {
      console.log("No active coaches found");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const coach of coaches) {
      try {
        // Get coach email
        const { data: coachProfile } = await supabase
          .from("profiles")
          .select("email, first_name")
          .eq("id", coach.user_id)
          .maybeSingle();

        if (!coachProfile?.email) continue;

        // Get active client count
        const { data: activeClients } = await supabase
          .from("subscriptions")
          .select("id, user_id, start_date")
          .eq("coach_id", coach.user_id)
          .eq("status", "active");

        const totalClients = activeClients?.length || 0;
        if (totalClients === 0) continue; // Skip coaches with no clients

        // Check exercise_set_logs for activity per client
        let totalWorkoutsLogged = 0;
        const inactiveClients: string[] = [];
        const activeClientNames: string[] = [];

        for (const client of activeClients!) {
          const { count } = await supabase
            .from("exercise_set_logs")
            .select("id", { count: "exact", head: true })
            .eq("created_by_user_id", client.user_id)
            .gte("created_at", oneWeekAgo);

          // Get client profile directly from the profiles view
          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", client.user_id)
            .maybeSingle();

          const clientName =
            `${clientProfile?.first_name || ""} ${clientProfile?.last_name || ""}`.trim() ||
            "Unknown";

          if (count && count > 0) {
            totalWorkoutsLogged++;
            activeClientNames.push(clientName);
          } else {
            inactiveClients.push(clientName);
          }
        }

        // New clients this week
        const newClients = activeClients!.filter(
          (c) => c.start_date && new Date(c.start_date) >= new Date(oneWeekAgo)
        );

        const coachFirstName =
          coachProfile.first_name || coach.first_name || "Coach";

        const { subject, html } = buildEmail(
          coachFirstName,
          totalClients,
          activeClientNames.length,
          inactiveClients,
          newClients.length
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

        if (emailResponse.ok) {
          results.digests_sent++;
          console.log(`Sent weekly digest to ${coachProfile.email}`);
        } else {
          const errorText = await emailResponse.text();
          console.error(
            `Failed to send digest to ${coachProfile.email}:`,
            errorText
          );
          results.errors.push(`${coachProfile.email}: digest failed`);
        }

        results.coaches_processed++;
      } catch (err: any) {
        console.error(`Error processing coach ${coach.user_id}:`, err);
        results.errors.push(`coach ${coach.user_id}: ${err.message}`);
      }
    }

    console.log("Weekly coach digest completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-weekly-coach-digest:", error);
    return new Response(
      JSON.stringify({ error: "Weekly coach digest failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildEmail(
  coachFirstName: string,
  totalClients: number,
  activeCount: number,
  inactiveClients: string[],
  newClientsCount: number
): { subject: string; html: string } {
  const dashboardUrl = `${APP_BASE_URL}/coach/dashboard`;
  const weekOf = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const inactiveSection =
    inactiveClients.length > 0
      ? `
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="color: #856404; font-size: 14px; margin: 0 0 8px 0; font-weight: bold;">
            Clients with no activity this week:
          </p>
          <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.6;">
            ${inactiveClients.join(", ")}
          </p>
        </div>
      `
      : "";

  const newClientSection =
    newClientsCount > 0
      ? `
        <div style="background-color: #f0fff4; border-left: 4px solid #48bb78; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="color: #276749; font-size: 14px; margin: 0;">
            <strong>${newClientsCount} new client${newClientsCount > 1 ? "s" : ""}</strong> joined your roster this week!
          </p>
        </div>
      `
      : "";

  return {
    subject: `Your Weekly Digest — ${weekOf}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Good morning, ${coachFirstName}!</h1>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Here's your weekly summary for the week of ${weekOf}:
          </p>

          <!-- Stats Grid -->
          <div style="display: flex; gap: 12px; margin: 24px 0;">
            <div style="flex: 1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 20px; text-align: center;">
              <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Total Clients</p>
              <p style="color: white; font-size: 28px; font-weight: bold; margin: 0;">${totalClients}</p>
            </div>
            <div style="flex: 1; background: linear-gradient(135deg, #48bb78 0%, #38a169 100%); border-radius: 8px; padding: 20px; text-align: center;">
              <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Active This Week</p>
              <p style="color: white; font-size: 28px; font-weight: bold; margin: 0;">${activeCount}</p>
            </div>
            <div style="flex: 1; background: linear-gradient(135deg, ${inactiveClients.length > 0 ? "#ed8936 0%, #dd6b20 100%" : "#a0aec0 0%, #718096 100%"}); border-radius: 8px; padding: 20px; text-align: center;">
              <p style="color: rgba(255,255,255,0.8); font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Inactive</p>
              <p style="color: white; font-size: 28px; font-weight: bold; margin: 0;">${inactiveClients.length}</p>
            </div>
          </div>

          ${newClientSection}
          ${inactiveSection}

          <div style="text-align: center; margin: 32px 0;">
            <a href="${dashboardUrl}"
               style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
              Open Dashboard
            </a>
          </div>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
            Have a great week,<br>
            <strong>The IGU Team</strong>
          </p>
        </div>
        <div style="text-align: center; margin-top: 16px;">
          <p style="color: #a0aec0; font-size: 12px; margin: 0;">
            This is your weekly coaching digest from IGU
          </p>
        </div>
      </div>
    `,
  };
}
