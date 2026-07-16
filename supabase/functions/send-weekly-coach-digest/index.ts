import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_COACHING,
  REPLY_TO_SUPPORT,
  APP_BASE_URL,
} from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, alertBox, ctaButton, signOff, statCard, statGrid, sectionHeading } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';
import { isEmailEnabled } from '../_shared/emailTypeLoader.ts';
import { summarizeRosterProgress } from './summarizeRosterProgress.ts';

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

    // Status filter on coaches; first_name/last_name from coaches_public
    // (canonical home post column-ownership refactor).
    const { data: activeRows, error: coachError } = await supabase
      .from("coaches")
      .select("user_id")
      .in("status", ["active", "approved"]);

    if (coachError) {
      throw new Error(`Failed to fetch coaches: ${coachError.message}`);
    }

    const activeUserIds = (activeRows || []).map((c: any) => c.user_id).filter(Boolean);
    const { data: profiles } = activeUserIds.length === 0
      ? { data: [] as { user_id: string; first_name: string | null; last_name: string | null }[] }
      : await supabase
          .from("coaches_public")
          .select("user_id, first_name, last_name")
          .in("user_id", activeUserIds);
    const coaches = profiles;

    if (!coaches || coaches.length === 0) {
      console.log("No active coaches found");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if weekly coach digest is enabled in admin settings
    if (!(await isEmailEnabled(supabase, "weekly_coach_digest"))) {
      return new Response(JSON.stringify({ skipped: "disabled" }), {
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

        const rosterUserIds = activeClients!.map((c) => c.user_id).filter(Boolean);

        // Roster-wide batched reads (replaces the per-client loop, which violated the
        // "no Promise.all in loops" rule). auth.uid() is null under the service role, so the
        // coach-scoped RPCs return {} here — we read the raw tables directly (service role
        // bypasses RLS) and crunch the numbers in the pure summarizeRosterProgress helper.
        const [profileRes, setLogRes, weighInRes, checkInRes] = await Promise.all([
          supabase.from("profiles").select("id, first_name, last_name").in("id", rosterUserIds),
          supabase
            .from("exercise_set_logs")
            .select("created_by_user_id, skipped")
            .in("created_by_user_id", rosterUserIds)
            .gte("created_at", oneWeekAgo),
          supabase
            .from("weight_logs")
            .select("user_id")
            .in("user_id", rosterUserIds)
            .gte("created_at", oneWeekAgo),
          supabase
            .from("adherence_logs")
            .select("user_id, followed_calories")
            .in("user_id", rosterUserIds)
            .gte("created_at", oneWeekAgo),
        ]);

        const nameById = new Map<string, string>();
        for (const p of profileRes.data ?? []) {
          nameById.set(
            p.id,
            `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Unknown",
          );
        }

        const progress = summarizeRosterProgress({
          rosterUserIds,
          weighInRows: (weighInRes.data ?? []) as Array<{ user_id: string }>,
          checkInRows: (checkInRes.data ?? []) as Array<{ user_id: string; followed_calories: boolean | null }>,
          setLogRows: (setLogRes.data ?? []) as Array<{ created_by_user_id: string; skipped: boolean | null }>,
        });

        const activeSet = new Set(progress.activeClientIds);
        const activeCount = activeSet.size;
        const inactiveClients = rosterUserIds
          .filter((id) => !activeSet.has(id))
          .map((id) => nameById.get(id) ?? "Unknown");

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
          // AD3 — real progress beyond the bare activity count. Every metric is honest: a client
          // with no weigh-in/check-in isn't counted, and a metric with no data reads 0.
          sectionHeading("This Week's Progress"),
          statGrid([
            statCard('Weigh-ins', `${progress.weighIns}/${totalClients}`),
            statCard('Check-ins', progress.checkIns),
            statCard('On Track', progress.onTrack),
            statCard('Sets Logged', progress.setsLogged),
          ]),
          progress.checkIns === 0
            ? paragraph('No check-ins logged this week.')
            : '',
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
