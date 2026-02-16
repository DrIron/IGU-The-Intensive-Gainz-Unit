import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_ADMIN,
  REPLY_TO_ADMIN,
  APP_BASE_URL,
} from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { EMAIL_BRAND } from '../_shared/emailTemplate.ts';
import { paragraph, alertBox, ctaButton, sectionHeading } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Coach inactivity monitor.
 * Called daily by n8n. Alerts admin if any active coach hasn't logged in
 * for 7+ days. Uses auth.users.last_sign_in_at for tracking.
 *
 * Sends one consolidated email to all admins listing inactive coaches.
 * Deduped weekly (won't re-alert about the same coach within 7 days).
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
      coaches_checked: 0,
      inactive_coaches: 0,
      alerts_sent: 0,
      already_alerted: 0,
      errors: [] as string[],
    };

    const sevenDaysAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    );

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

    results.coaches_checked = coaches.length;

    // Check last_sign_in_at for each coach via auth.users (service role access)
    const inactiveCoaches: {
      name: string;
      email: string;
      daysSinceLogin: number;
      clientCount: number;
    }[] = [];

    for (const coach of coaches) {
      try {
        // Get auth user data (last_sign_in_at)
        const {
          data: { user },
        } = await supabase.auth.admin.getUserById(coach.user_id);

        if (!user) continue;

        const lastSignIn = user.last_sign_in_at
          ? new Date(user.last_sign_in_at)
          : null;

        // If never signed in or signed in > 7 days ago
        if (lastSignIn && lastSignIn >= sevenDaysAgo) continue;

        const daysSinceLogin = lastSignIn
          ? Math.floor(
              (now.getTime() - lastSignIn.getTime()) / (24 * 60 * 60 * 1000)
            )
          : -1; // -1 means never signed in

        // Check if we already alerted about this coach recently (within 7 days)
        const weekAgo = new Date(
          now.getTime() - 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        const { data: recentAlert } = await supabase
          .from("email_notifications")
          .select("id")
          .eq("user_id", coach.user_id)
          .eq("notification_type", "coach_inactivity_admin_alert")
          .gte("sent_at", weekAgo)
          .maybeSingle();

        if (recentAlert) {
          results.already_alerted++;
          continue;
        }

        // Get coach's active client count
        const { count: clientCount } = await supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("coach_id", coach.user_id)
          .eq("status", "active");

        inactiveCoaches.push({
          name: [coach.first_name, coach.last_name].filter(Boolean).join(" ") || user.email || "Unknown",
          email: user.email || "no email",
          daysSinceLogin,
          clientCount: clientCount || 0,
        });

        // Log notification for dedup
        await supabase.from("email_notifications").insert({
          user_id: coach.user_id,
          notification_type: "coach_inactivity_admin_alert",
          status: "sent",
          sent_at: new Date().toISOString(),
        });
      } catch (err: any) {
        console.error(`Error checking coach ${coach.user_id}:`, err);
        results.errors.push(`coach ${coach.user_id}: ${err.message}`);
      }
    }

    results.inactive_coaches = inactiveCoaches.length;

    if (inactiveCoaches.length === 0) {
      console.log("All coaches are active");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send consolidated alert to all admins
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) {
      console.log("No admin users to notify");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { subject, preheader, content } = buildAdminAlert(inactiveCoaches);
    const html = wrapInLayout({ content, preheader });

    for (const adminRole of adminRoles) {
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", adminRole.user_id)
        .maybeSingle();

      if (!adminProfile?.email) continue;

      const result = await sendEmail({
        from: EMAIL_FROM_ADMIN,
        to: adminProfile.email,
        subject,
        html,
        replyTo: REPLY_TO_ADMIN,
      });

      if (result.success) {
        results.alerts_sent++;
        console.log(
          `Sent coach inactivity alert to ${adminProfile.email} (${inactiveCoaches.length} coaches)`
        );
      } else {
        console.error(
          `Failed to send alert to ${adminProfile.email}:`,
          result.error
        );
        results.errors.push(`${adminProfile.email}: send failed`);
      }
    }

    console.log("Coach inactivity monitor completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-coach-inactivity-monitor:", error);
    return new Response(
      JSON.stringify({ error: "Coach inactivity monitor failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

interface InactiveCoach {
  name: string;
  email: string;
  daysSinceLogin: number;
  clientCount: number;
}

function buildAdminAlert(
  inactiveCoaches: InactiveCoach[]
): { subject: string; preheader: string; content: string } {
  const adminUrl = `${APP_BASE_URL}/admin/dashboard`;
  const highPriority = inactiveCoaches.filter((c) => c.clientCount > 0);

  const coachRows = inactiveCoaches
    .sort((a, b) => b.clientCount - a.clientCount)
    .map(
      (coach) => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${EMAIL_BRAND.gray200}; color: ${EMAIL_BRAND.heading}; font-size: 14px;">
          <strong>${coach.name}</strong><br>
          <span style="color: ${EMAIL_BRAND.muted}; font-size: 12px;">${coach.email}</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${EMAIL_BRAND.gray200}; color: ${coach.daysSinceLogin > 14 ? EMAIL_BRAND.error : EMAIL_BRAND.warning}; font-size: 14px; text-align: center;">
          ${coach.daysSinceLogin === -1 ? "Never" : `${coach.daysSinceLogin} days`}
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid ${EMAIL_BRAND.gray200}; color: ${EMAIL_BRAND.heading}; font-size: 14px; text-align: center;">
          ${coach.clientCount}
        </td>
      </tr>`
    )
    .join("");

  const alertSection = highPriority.length > 0
    ? alertBox(`<strong>${highPriority.length} of these ${highPriority.length > 1 ? "have" : "has"} active clients</strong> who may not be receiving programming updates.`, 'error')
    : '';

  const coachTable = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; border: 1px solid ${EMAIL_BRAND.gray200}; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background-color: ${EMAIL_BRAND.gray100};">
          <th style="padding: 12px 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: ${EMAIL_BRAND.muted}; letter-spacing: 0.5px;">Coach</th>
          <th style="padding: 12px 16px; text-align: center; font-size: 12px; text-transform: uppercase; color: ${EMAIL_BRAND.muted}; letter-spacing: 0.5px;">Last Login</th>
          <th style="padding: 12px 16px; text-align: center; font-size: 12px; text-transform: uppercase; color: ${EMAIL_BRAND.muted}; letter-spacing: 0.5px;">Clients</th>
        </tr>
      </thead>
      <tbody>
        ${coachRows}
      </tbody>
    </table>`;

  return {
    subject: `Coach Inactivity Alert: ${inactiveCoaches.length} coach${inactiveCoaches.length > 1 ? "es" : ""} inactive`,
    preheader: `${inactiveCoaches.length} coach${inactiveCoaches.length > 1 ? "es haven't" : " hasn't"} logged in for 7+ days${highPriority.length > 0 ? ` -- ${highPriority.length} with active clients` : ''}.`,
    content: [
      sectionHeading('Coach Inactivity Alert'),
      paragraph(`The following ${inactiveCoaches.length} coach${inactiveCoaches.length > 1 ? "es haven't" : " hasn't"} logged in for 7+ days:`),
      alertSection,
      coachTable,
      ctaButton('Open Admin Dashboard', adminUrl),
      paragraph('This alert is sent once per inactive coach per week.'),
    ].join(''),
  };
}
