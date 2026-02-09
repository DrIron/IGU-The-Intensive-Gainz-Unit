import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_ADMIN,
  REPLY_TO_ADMIN,
  APP_BASE_URL,
} from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Admin daily summary email.
 * Called daily by n8n (early morning). Sends a platform health snapshot
 * to all admin users.
 *
 * Includes:
 * - Total active subscriptions
 * - New signups (last 24h)
 * - Failed payments
 * - Pending coach applications
 * - Pending onboarding drafts
 * - New leads (last 24h)
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
    const oneDayAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    ).toISOString();

    // Gather platform stats in parallel
    const [
      activeSubsResult,
      newSubsResult,
      failedSubsResult,
      pendingAppsResult,
      staleDraftsResult,
      newLeadsResult,
      totalClientsResult,
      totalCoachesResult,
    ] = await Promise.all([
      // Active subscriptions
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      // New subscriptions in last 24h
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", oneDayAgo),
      // Failed subscriptions
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      // Pending coach applications
      supabase
        .from("coach_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      // Stale onboarding drafts (> 1 day old)
      supabase
        .from("onboarding_drafts")
        .select("id", { count: "exact", head: true })
        .lt("updated_at", oneDayAgo),
      // New leads in last 24h
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", oneDayAgo),
      // Total clients (users with client role)
      supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "client"),
      // Total active coaches
      supabase
        .from("coaches")
        .select("user_id", { count: "exact", head: true })
        .in("status", ["active", "approved"]),
    ]);

    const stats = {
      activeSubs: activeSubsResult.count || 0,
      newSubs: newSubsResult.count || 0,
      failedSubs: failedSubsResult.count || 0,
      pendingApps: pendingAppsResult.count || 0,
      staleDrafts: staleDraftsResult.count || 0,
      newLeads: newLeadsResult.count || 0,
      totalClients: totalClientsResult.count || 0,
      totalCoaches: totalCoachesResult.count || 0,
    };

    // Get admin emails
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) {
      console.log("No admin users found");
      return new Response(
        JSON.stringify({ error: "No admin users found" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const results = {
      admins_emailed: 0,
      stats,
      errors: [] as string[],
    };

    for (const adminRole of adminRoles) {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("email, first_name")
        .eq("id", adminRole.user_id)
        .maybeSingle();

      if (!adminProfile?.email) continue;

      const firstName = adminProfile.first_name || "Admin";
      const { subject, html } = buildEmail(firstName, stats);

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: EMAIL_FROM_ADMIN,
          to: [adminProfile.email],
          subject,
          html,
          reply_to: REPLY_TO_ADMIN,
        }),
      });

      if (emailResponse.ok) {
        results.admins_emailed++;
        console.log(`Sent daily summary to ${adminProfile.email}`);
      } else {
        const errorText = await emailResponse.text();
        console.error(
          `Failed to send summary to ${adminProfile.email}:`,
          errorText
        );
        results.errors.push(`${adminProfile.email}: send failed`);
      }
    }

    console.log("Admin daily summary completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in send-admin-daily-summary:", error);
    return new Response(
      JSON.stringify({ error: "Admin daily summary failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

interface PlatformStats {
  activeSubs: number;
  newSubs: number;
  failedSubs: number;
  pendingApps: number;
  staleDrafts: number;
  newLeads: number;
  totalClients: number;
  totalCoaches: number;
}

function buildEmail(
  firstName: string,
  stats: PlatformStats
): { subject: string; html: string } {
  const adminUrl = `${APP_BASE_URL}/admin/dashboard`;
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const alertItems: string[] = [];
  if (stats.failedSubs > 0)
    alertItems.push(
      `<span style="color: #e53e3e;">${stats.failedSubs} failed payment${stats.failedSubs > 1 ? "s" : ""}</span>`
    );
  if (stats.pendingApps > 0)
    alertItems.push(
      `<span style="color: #d69e2e;">${stats.pendingApps} pending coach application${stats.pendingApps > 1 ? "s" : ""}</span>`
    );
  if (stats.staleDrafts > 0)
    alertItems.push(
      `<span style="color: #d69e2e;">${stats.staleDrafts} stale onboarding draft${stats.staleDrafts > 1 ? "s" : ""}</span>`
    );

  const alertSection =
    alertItems.length > 0
      ? `
        <div style="background-color: #fff5f5; border-left: 4px solid #e53e3e; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="color: #742a2a; font-size: 14px; margin: 0 0 8px 0; font-weight: bold;">
            Needs Attention:
          </p>
          <ul style="color: #742a2a; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
            ${alertItems.map((item) => `<li>${item}</li>`).join("")}
          </ul>
        </div>
      `
      : `
        <div style="background-color: #f0fff4; border-left: 4px solid #48bb78; padding: 16px; margin: 24px 0; border-radius: 4px;">
          <p style="color: #276749; font-size: 14px; margin: 0;">
            All clear — no items need immediate attention.
          </p>
        </div>
      `;

  return {
    subject: `IGU Daily Summary — ${dateStr}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 8px;">Good morning, ${firstName}!</h1>
          <p style="color: #718096; font-size: 14px; margin: 0 0 24px 0;">${dateStr}</p>

          ${alertSection}

          <!-- Stats Grid -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
            <tr>
              <td width="50%" style="padding: 8px;">
                <div style="background-color: #f7fafc; border-radius: 8px; padding: 16px; text-align: center;">
                  <p style="color: #718096; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Active Subs</p>
                  <p style="color: #2d3748; font-size: 24px; font-weight: bold; margin: 0;">${stats.activeSubs}</p>
                </div>
              </td>
              <td width="50%" style="padding: 8px;">
                <div style="background-color: #f7fafc; border-radius: 8px; padding: 16px; text-align: center;">
                  <p style="color: #718096; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">New Signups (24h)</p>
                  <p style="color: #2d3748; font-size: 24px; font-weight: bold; margin: 0;">${stats.newSubs}</p>
                </div>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 8px;">
                <div style="background-color: #f7fafc; border-radius: 8px; padding: 16px; text-align: center;">
                  <p style="color: #718096; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Total Clients</p>
                  <p style="color: #2d3748; font-size: 24px; font-weight: bold; margin: 0;">${stats.totalClients}</p>
                </div>
              </td>
              <td width="50%" style="padding: 8px;">
                <div style="background-color: #f7fafc; border-radius: 8px; padding: 16px; text-align: center;">
                  <p style="color: #718096; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Active Coaches</p>
                  <p style="color: #2d3748; font-size: 24px; font-weight: bold; margin: 0;">${stats.totalCoaches}</p>
                </div>
              </td>
            </tr>
            <tr>
              <td width="50%" style="padding: 8px;">
                <div style="background-color: #f7fafc; border-radius: 8px; padding: 16px; text-align: center;">
                  <p style="color: #718096; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">New Leads (24h)</p>
                  <p style="color: #2d3748; font-size: 24px; font-weight: bold; margin: 0;">${stats.newLeads}</p>
                </div>
              </td>
              <td width="50%" style="padding: 8px;">
                <div style="background-color: ${stats.failedSubs > 0 ? "#fff5f5" : "#f7fafc"}; border-radius: 8px; padding: 16px; text-align: center;">
                  <p style="color: #718096; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Failed Payments</p>
                  <p style="color: ${stats.failedSubs > 0 ? "#e53e3e" : "#2d3748"}; font-size: 24px; font-weight: bold; margin: 0;">${stats.failedSubs}</p>
                </div>
              </td>
            </tr>
          </table>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${adminUrl}"
               style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
              Open Admin Dashboard
            </a>
          </div>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
            <strong>The IGU Platform</strong>
          </p>
        </div>
        <div style="text-align: center; margin-top: 16px;">
          <p style="color: #a0aec0; font-size: 12px; margin: 0;">
            This is your daily platform summary from IGU
          </p>
        </div>
      </div>
    `,
  };
}
