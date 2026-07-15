import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EMAIL_FROM_COACHING, REPLY_TO_SUPPORT, APP_BASE_URL } from "../_shared/config.ts";
import { wrapInLayout } from "../_shared/emailTemplate.ts";
import { greeting, paragraph, alertBox, ctaButton, signOff } from "../_shared/emailComponents.ts";
import { sendEmail } from "../_shared/sendEmail.ts";
import { isEmailEnabled } from "../_shared/emailTypeLoader.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Macro-alert to coach (P5c). Called daily by Vercel Cron.
 *
 * For each active client with a coach, evaluate_loud_macro_alert() checks the 7-day rolling
 * average of logged calories + protein against the active target. It fires ONLY with >= 4
 * logged days (the honesty gate — never nudge a coach off sparse data), and never flags high
 * protein. When it fires, the coach gets ONE calm, factual email per client per 7 days.
 *
 * Copy is deliberately non-shaming: subject "Nutrition check-in", never "alert"/"failing". A
 * missed target over a week is information for the coach to act on, not a verdict on the client.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const results = {
      active_clients_checked: 0,
      alerts_sent: 0,
      not_firing: 0,
      insufficient_data: 0,
      already_sent: 0,
      skipped_disabled: 0,
      errors: [] as string[],
    };

    const { data: activeSubs, error: fetchError } = await supabase
      .from("subscriptions")
      .select("id, user_id, coach_id")
      .eq("status", "active")
      .not("coach_id", "is", null);

    if (fetchError) throw new Error(`Failed to fetch active subscriptions: ${fetchError.message}`);
    if (!activeSubs || activeSubs.length === 0) {
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    results.active_clients_checked = activeSubs.length;

    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const sub of activeSubs) {
      try {
        const { data: evalRes, error: evalError } = await supabase.rpc("evaluate_loud_macro_alert", {
          p_client_id: sub.user_id,
          p_end_date: today,
        });
        if (evalError) {
          results.errors.push(`eval ${sub.id}: ${evalError.message}`);
          continue;
        }
        const evaluation = evalRes as {
          fires: boolean;
          reasons: string[];
          insufficient_data: boolean;
          calorie_deviation_pct: number | null;
          protein_deviation_pct: number | null;
        } | null;

        if (!evaluation) continue;
        if (evaluation.insufficient_data) {
          results.insufficient_data++;
          continue;
        }
        if (!evaluation.fires) {
          results.not_firing++;
          continue;
        }

        // Dedup: at most one macro check-in per client per 7 days.
        const { data: recent } = await supabase
          .from("email_notifications")
          .select("id")
          .eq("user_id", sub.user_id)
          .eq("notification_type", "macro_alert_coach")
          .gte("sent_at", sevenDaysAgo)
          .maybeSingle();
        if (recent) {
          results.already_sent++;
          continue;
        }

        if (!(await isEmailEnabled(supabase, "macro_alert_coach"))) {
          results.skipped_disabled++;
          continue;
        }

        const [{ data: profile }, { data: coachProfile }] = await Promise.all([
          supabase.from("profiles").select("first_name, last_name").eq("id", sub.user_id).maybeSingle(),
          supabase.from("profiles").select("email, first_name").eq("id", sub.coach_id).maybeSingle(),
        ]);
        if (!coachProfile?.email) continue;

        // The active target, for the actual-vs-target specifics in the copy.
        const { data: target } = await supabase.rpc("get_active_nutrition_target", {
          p_user_id: sub.user_id,
        });
        const t = target as { kcal: number; protein_g: number } | null;

        const clientName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "your client";
        const coachFirstName = coachProfile.first_name || "Coach";
        const nutritionUrl = `${APP_BASE_URL}/coach/clients/${sub.user_id}?tab=nutrition`;

        // One factual, forward-looking sentence per reason. No "failed"/"bad"/"off track".
        const reasonLines: string[] = [];
        const calDev = evaluation.calorie_deviation_pct;
        const protDev = evaluation.protein_deviation_pct;
        if (evaluation.reasons.includes("protein_low") && t && protDev != null) {
          const actual = Math.round(t.protein_g * (1 + protDev / 100));
          reasonLines.push(
            `Over the past week, ${clientName}'s average protein has been about <strong>${Math.abs(protDev)}% under target</strong> (${actual}g vs ${Math.round(t.protein_g)}g).`,
          );
        }
        if (evaluation.reasons.includes("calories_low") && t && calDev != null) {
          const actual = Math.round(t.kcal * (1 + calDev / 100));
          reasonLines.push(
            `Their average calories have been about <strong>${Math.abs(calDev)}% under target</strong> (${actual} vs ${Math.round(t.kcal)} kcal).`,
          );
        }
        if (evaluation.reasons.includes("calories_high") && t && calDev != null) {
          const actual = Math.round(t.kcal * (1 + calDev / 100));
          reasonLines.push(
            `Their average calories have been about <strong>${Math.abs(calDev)}% over target</strong> (${actual} vs ${Math.round(t.kcal)} kcal).`,
          );
        }
        if (reasonLines.length === 0) {
          // Fired but no target detail to render specifics (shouldn't happen — fire needs a
          // target). Skip rather than send a vague email.
          continue;
        }

        const content = [
          greeting(coachFirstName),
          paragraph(
            `A quick nutrition check-in on <strong>${clientName}</strong>, based on the last 7 days of their food log:`,
          ),
          paragraph(reasonLines.join(" ")),
          alertBox(
            "<strong>Suggested action:</strong> a quick message or a small target tweak can help get them back on track. Nothing here needs urgent action — it's a heads-up while there's time to adjust.",
            "info",
          ),
          ctaButton(`View ${clientName}'s nutrition`, nutritionUrl),
          paragraph("You'll get this at most once every 7 days per client."),
          signOff(),
        ].join("");

        const html = wrapInLayout({
          content,
          preheader: `A nutrition heads-up on ${clientName} from the last week of logging.`,
        });

        const result = await sendEmail({
          from: EMAIL_FROM_COACHING,
          to: coachProfile.email,
          subject: `Nutrition check-in: ${clientName}`,
          html,
          replyTo: REPLY_TO_SUPPORT,
        });

        await supabase.from("email_notifications").insert({
          user_id: sub.user_id,
          notification_type: "macro_alert_coach",
          status: result.success ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (result.success) {
          results.alerts_sent++;
        } else {
          results.errors.push(`${clientName}: macro check-in email failed`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error processing subscription ${sub.id}:`, msg);
        results.errors.push(`sub ${sub.id}: ${msg}`);
      }
    }

    console.log("Macro alert check completed:", results);
    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Error in process-macro-alerts:", msg);
    return new Response(JSON.stringify({ error: "Macro alert check failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
