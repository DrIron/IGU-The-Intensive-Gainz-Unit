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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

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
      .select(
        `
        id,
        user_id,
        start_date,
        profiles!subscriptions_user_id_fkey(id, email, first_name)
      `
      )
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
        const profileData = sub.profiles as any;
        if (!profileData || Array.isArray(profileData)) continue;

        const profile = profileData as {
          id: string;
          email: string;
          first_name: string | null;
        };

        if (!profile.email) continue;

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

        const { subject, html } = buildEmail(firstName, referralCode);

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
            `Failed to send referral reminder to ${profile.email}:`,
            errorText
          );
        }

        await supabase.from("email_notifications").insert({
          user_id: sub.user_id,
          notification_type: "referral_reminder",
          status: emailOk ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (emailOk) {
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

function buildEmail(
  firstName: string,
  referralCode?: string
): { subject: string; html: string } {
  const dashboardUrl = `${APP_BASE_URL}/dashboard`;

  const codeSection = referralCode
    ? `
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
        <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0 0 8px 0;">YOUR REFERRAL CODE</p>
        <p style="color: white; font-size: 28px; font-weight: bold; margin: 0; letter-spacing: 2px;">${referralCode}</p>
      </div>
    `
    : `
      <div style="background-color: #ebf8ff; border-left: 4px solid #4299e1; padding: 16px; margin: 24px 0; border-radius: 4px;">
        <p style="color: #2b6cb0; font-size: 14px; margin: 0;">
          Log in to your dashboard to get your unique referral code.
        </p>
      </div>
    `;

  return {
    subject: "Share IGU with a friend",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            You've been training with IGU for a couple of weeks now — and we hope you're loving it! Did you know you can share the experience with friends?
          </p>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            When your friend signs up using your referral code, you both benefit. It's our way of saying thanks for spreading the word.
          </p>

          ${codeSection}

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Just share your code with anyone who's interested in personal coaching — they'll enter it during signup.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${dashboardUrl}"
               style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
              Go to Dashboard
            </a>
          </div>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
            Keep up the great work,<br>
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
