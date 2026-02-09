import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_BILLING,
  REPLY_TO_SUPPORT,
  AUTH_REDIRECT_URLS,
} from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Subscription renewal reminder.
 * Called daily by n8n. Sends a heads-up email to clients 3 days before
 * their next_billing_date so they know a charge is coming.
 *
 * Only sends once per billing cycle (deduped by notification_type + month).
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
      subscriptions_checked: 0,
      reminders_sent: 0,
      already_sent: 0,
      errors: [] as string[],
    };

    // 3 days from now
    const threeDaysFromNow = new Date(
      now.getTime() + 3 * 24 * 60 * 60 * 1000
    );
    // Window: next_billing_date between now and 3 days from now
    const { data: upcomingSubs, error: fetchError } = await supabase
      .from("subscriptions")
      .select(
        `
        id,
        user_id,
        next_billing_date,
        profiles!subscriptions_user_id_fkey(id, email, first_name),
        services(name, price)
      `
      )
      .eq("status", "active")
      .gte("next_billing_date", now.toISOString())
      .lte("next_billing_date", threeDaysFromNow.toISOString());

    if (fetchError) {
      throw new Error(
        `Failed to fetch upcoming renewals: ${fetchError.message}`
      );
    }

    if (!upcomingSubs || upcomingSubs.length === 0) {
      console.log("No upcoming renewals in 3-day window");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    results.subscriptions_checked = upcomingSubs.length;

    for (const sub of upcomingSubs) {
      try {
        const profileData = sub.profiles as any;
        if (!profileData || Array.isArray(profileData)) continue;

        const profile = profileData as {
          id: string;
          email: string;
          first_name: string | null;
        };

        if (!profile.email) continue;

        // Use billing date month as dedup key
        const billingDate = new Date(sub.next_billing_date);
        const monthKey = `${billingDate.getFullYear()}-${String(
          billingDate.getMonth() + 1
        ).padStart(2, "0")}`;
        const notificationType = `renewal_reminder_${monthKey}`;

        // Check if already sent for this billing cycle
        const { data: existing } = await supabase
          .from("email_notifications")
          .select("id")
          .eq("user_id", sub.user_id)
          .eq("notification_type", notificationType)
          .maybeSingle();

        if (existing) {
          results.already_sent++;
          continue;
        }

        const firstName = profile.first_name || "there";
        const serviceData = sub.services as any;
        const serviceName = serviceData?.name || "your coaching program";
        const price = serviceData?.price;
        const renewalDate = billingDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });

        const { subject, html } = buildEmail(
          firstName,
          serviceName,
          renewalDate,
          price
        );

        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: EMAIL_FROM_BILLING,
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
            `Failed to send renewal reminder to ${profile.email}:`,
            errorText
          );
        }

        await supabase.from("email_notifications").insert({
          user_id: sub.user_id,
          notification_type: notificationType,
          status: emailOk ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (emailOk) {
          results.reminders_sent++;
          console.log(
            `Sent renewal reminder to ${profile.email} (billing ${renewalDate})`
          );
        } else {
          results.errors.push(`${profile.email}: renewal reminder failed`);
        }
      } catch (err: any) {
        console.error(`Error processing subscription ${sub.id}:`, err);
        results.errors.push(`sub ${sub.id}: ${err.message}`);
      }
    }

    console.log("Renewal reminder check completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-renewal-reminders:", error);
    return new Response(
      JSON.stringify({ error: "Renewal reminder check failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildEmail(
  firstName: string,
  serviceName: string,
  renewalDate: string,
  price?: number
): { subject: string; html: string } {
  const billingUrl = AUTH_REDIRECT_URLS.billingPay;

  return {
    subject: `Upcoming renewal: ${serviceName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
        <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <h1 style="color: #2d3748; font-size: 24px; margin-bottom: 20px;">Hi ${firstName},</h1>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Just a heads-up — your <strong>${serviceName}</strong> subscription will renew on <strong>${renewalDate}</strong>.
          </p>

          <div style="background-color: #f7fafc; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <div style="border-left: 3px solid #4CAF50; padding-left: 16px;">
              <p style="color: #4a5568; font-size: 14px; margin: 8px 0;"><strong>Program:</strong> ${serviceName}</p>
              <p style="color: #4a5568; font-size: 14px; margin: 8px 0;"><strong>Renewal Date:</strong> ${renewalDate}</p>
              ${price ? `<p style="color: #4a5568; font-size: 14px; margin: 8px 0;"><strong>Amount:</strong> ${price} KWD</p>` : ""}
            </div>
          </div>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            No action is needed if you'd like to continue — your payment will be processed automatically. If you need to update your payment method, you can do so from your billing page.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${billingUrl}"
               style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
              View Billing Details
            </a>
          </div>

          <p style="color: #4a5568; font-size: 16px; line-height: 1.5;">
            Best regards,<br>
            <strong>The IGU Team</strong>
          </p>
        </div>
        <div style="text-align: center; margin-top: 16px;">
          <p style="color: #a0aec0; font-size: 12px; margin: 0;">
            This is an automated billing notification from IGU
          </p>
        </div>
      </div>
    `,
  };
}
