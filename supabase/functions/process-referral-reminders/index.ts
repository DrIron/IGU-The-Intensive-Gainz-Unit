import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_COACHING,
  REPLY_TO_SUPPORT,
  APP_BASE_URL,
} from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { EMAIL_BRAND } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, alertBox, banner, ctaButton, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Referral program reminder.
 * Called weekly by n8n. Finds clients who have been active for 2+ weeks
 * and reminds them about the referral program.
 *
 * Only sends once per client (lifetime dedup).
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
      reminders_sent: 0,
      already_sent: 0,
      errors: [] as string[],
    };

    // 2 weeks ago
    const twoWeeksAgo = new Date(
      now.getTime() - 14 * 24 * 60 * 60 * 1000
    ).toISOString();

    // Find active subscriptions that started 2+ weeks ago
    const { data: eligibleSubs, error: fetchError } = await supabase
      .from("subscriptions")
      .select("id, user_id, start_date")
      .eq("status", "active")
      .lte("start_date", twoWeeksAgo);

    if (fetchError) {
      throw new Error(
        `Failed to fetch eligible subscriptions: ${fetchError.message}`
      );
    }

    if (!eligibleSubs || eligibleSubs.length === 0) {
      console.log("No clients past 2-week mark");
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

        // Check if referral reminder was already sent (lifetime dedup)
        const { data: existing } = await supabase
          .from("email_notifications")
          .select("id")
          .eq("user_id", sub.user_id)
          .eq("notification_type", "referral_reminder")
          .maybeSingle();

        if (existing) {
          results.already_sent++;
          continue;
        }

        // Get the client's referral code if they have one
        const { data: referral } = await supabase
          .from("referrals")
          .select("referral_code")
          .eq("referrer_user_id", sub.user_id)
          .maybeSingle();

        const firstName = profile.first_name || "there";
        const referralCode = referral?.referral_code;
        const dashboardUrl = `${APP_BASE_URL}/dashboard`;

        const codeSection = referralCode
          ? banner(referralCode, 'Your Referral Code')
          : alertBox('Log in to your dashboard to get your unique referral code.', 'info');

        const content = [
          greeting(firstName),
          paragraph("You've been training with IGU for a couple of weeks now -- and we hope you're loving it! Did you know you can share the experience with friends?"),
          paragraph("When your friend signs up using your referral code, you both benefit. It's our way of saying thanks for spreading the word."),
          codeSection,
          paragraph("Just share your code with anyone who's interested in personal coaching -- they'll enter it during signup."),
          ctaButton('Go to Dashboard', dashboardUrl),
          signOff(),
        ].join('');

        const html = wrapInLayout({
          content,
          preheader: referralCode
            ? `Your IGU referral code: ${referralCode} -- share it with friends!`
            : 'Share IGU with a friend and you both benefit.',
          showUnsubscribe: true,
        });

        const result = await sendEmail({
          from: EMAIL_FROM_COACHING,
          to: profile.email,
          subject: "Share IGU with a friend",
          html,
          replyTo: REPLY_TO_SUPPORT,
        });

        await supabase.from("email_notifications").insert({
          user_id: sub.user_id,
          notification_type: "referral_reminder",
          status: result.success ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (result.success) {
          results.reminders_sent++;
          console.log(`Sent referral reminder to ${profile.email}`);
        } else {
          results.errors.push(`${profile.email}: referral reminder failed`);
        }
      } catch (err: any) {
        console.error(`Error processing subscription ${sub.id}:`, err);
        results.errors.push(`sub ${sub.id}: ${err.message}`);
      }
    }

    console.log("Referral reminder check completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-referral-reminders:", error);
    return new Response(
      JSON.stringify({ error: "Referral reminder check failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
