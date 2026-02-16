import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_ADMIN,
  REPLY_TO_ADMIN,
  APP_BASE_URL,
} from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, alertBox, ctaButton, signOff, statCard, statGrid, sectionHeading } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", oneDayAgo),
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed"),
      supabase
        .from("coach_applications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase
        .from("onboarding_drafts")
        .select("id", { count: "exact", head: true })
        .lt("updated_at", oneDayAgo),
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .gte("created_at", oneDayAgo),
      supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "client"),
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

    const dateStr = now.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    for (const adminRole of adminRoles) {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("email, first_name")
        .eq("id", adminRole.user_id)
        .maybeSingle();

      if (!adminProfile?.email) continue;

      const firstName = adminProfile.first_name || "Admin";

      // Build alert section
      const alertItems: string[] = [];
      if (stats.failedSubs > 0)
        alertItems.push(`${stats.failedSubs} failed payment${stats.failedSubs > 1 ? "s" : ""}`);
      if (stats.pendingApps > 0)
        alertItems.push(`${stats.pendingApps} pending coach application${stats.pendingApps > 1 ? "s" : ""}`);
      if (stats.staleDrafts > 0)
        alertItems.push(`${stats.staleDrafts} stale onboarding draft${stats.staleDrafts > 1 ? "s" : ""}`);

      const alertSection = alertItems.length > 0
        ? alertBox(`<strong>Needs Attention:</strong><br>${alertItems.join('<br>')}`, 'error')
        : alertBox('All clear -- no items need immediate attention.', 'success');

      const content = [
        greeting(firstName),
        paragraph(`Here's your platform summary for ${dateStr}.`),
        alertSection,
        sectionHeading('Platform Overview'),
        statGrid([
          statCard('Active Subs', stats.activeSubs),
          statCard('New Signups (24h)', stats.newSubs),
          statCard('Total Clients', stats.totalClients),
          statCard('Active Coaches', stats.totalCoaches),
          statCard('New Leads (24h)', stats.newLeads),
          statCard('Failed Payments', stats.failedSubs, stats.failedSubs > 0),
        ]),
        ctaButton('Open Admin Dashboard', `${APP_BASE_URL}/admin/dashboard`),
        signOff(),
      ].join('');

      const html = wrapInLayout({
        content,
        preheader: `IGU Daily Summary: ${stats.activeSubs} active subs, ${stats.newSubs} new signups${stats.failedSubs > 0 ? `, ${stats.failedSubs} failed payments` : ''}`,
      });

      const result = await sendEmail({
        from: EMAIL_FROM_ADMIN,
        to: adminProfile.email,
        subject: `IGU Daily Summary -- ${dateStr}`,
        html,
        replyTo: REPLY_TO_ADMIN,
      });

      if (result.success) {
        results.admins_emailed++;
        console.log(`Sent daily summary to ${adminProfile.email}`);
      } else {
        console.error(
          `Failed to send summary to ${adminProfile.email}:`,
          result.error
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
