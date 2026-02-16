import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_COACHING,
  REPLY_TO_SUPPORT,
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
    const results = {
      coaches_processed: 0,
      digests_sent: 0,
      errors: [] as string[],
    };

    const oneWeekAgo = new Date(
      now.getTime() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

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
        const { data: coachProfile } = await supabase
          .from("profiles")
          .select("email, first_name")
          .eq("id", coach.user_id)
          .maybeSingle();

        if (!coachProfile?.email) continue;

        const { data: activeClients } = await supabase
          .from("subscriptions")
          .select("id, user_id, start_date")
          .eq("coach_id", coach.user_id)
          .eq("status", "active");

        const totalClients = activeClients?.length || 0;
        if (totalClients === 0) continue;

        let activeCount = 0;
        const inactiveClients: string[] = [];

        for (const client of activeClients!) {
          const { count } = await supabase
            .from("exercise_set_logs")
            .select("id", { count: "exact", head: true })
            .eq("created_by_user_id", client.user_id)
            .gte("created_at", oneWeekAgo);

          const { data: clientProfile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", client.user_id)
            .maybeSingle();

          const clientName =
            `${clientProfile?.first_name || ""} ${clientProfile?.last_name || ""}`.trim() ||
            "Unknown";

          if (count && count > 0) {
            activeCount++;
          } else {
            inactiveClients.push(clientName);
          }
        }

        const newClients = activeClients!.filter(
          (c) => c.start_date && new Date(c.start_date) >= new Date(oneWeekAgo)
        );

        const coachFirstName =
          coachProfile.first_name || coach.first_name || "Coach";
        const weekOf = now.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });

        const content = [
          greeting(coachFirstName),
          paragraph(`Here's your weekly summary for the week of ${weekOf}:`),
          sectionHeading('This Week at a Glance'),
          statGrid([
            statCard('Total Clients', totalClients),
            statCard('Active This Week', activeCount),
            statCard('Inactive', inactiveClients.length, inactiveClients.length > 0),
            statCard('New This Week', newClients.length),
          ]),
          newClients.length > 0
            ? alertBox(`<strong>${newClients.length} new client${newClients.length > 1 ? 's' : ''}</strong> joined your roster this week!`, 'success')
            : '',
          inactiveClients.length > 0
            ? alertBox(`<strong>Clients with no activity this week:</strong><br>${inactiveClients.join(', ')}`, 'warning')
            : '',
          ctaButton('Open Dashboard', `${APP_BASE_URL}/dashboard`),
          paragraph('Have a great week!'),
          signOff(),
        ].join('');

        const html = wrapInLayout({
          content,
          preheader: `Weekly digest: ${totalClients} clients, ${activeCount} active this week`,
        });

        const result = await sendEmail({
          from: EMAIL_FROM_COACHING,
          to: coachProfile.email,
          subject: `Your Weekly Digest -- ${weekOf}`,
          html,
          replyTo: REPLY_TO_SUPPORT,
        });

        if (result.success) {
          results.digests_sent++;
          console.log(`Sent weekly digest to ${coachProfile.email}`);
        } else {
          console.error(
            `Failed to send digest to ${coachProfile.email}:`,
            result.error
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
