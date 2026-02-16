import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM_BILLING,
  REPLY_TO_SUPPORT,
  AUTH_REDIRECT_URLS,
} from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, detailCard, ctaButton, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

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
      .select("id, user_id, next_billing_date, services(name, price_kwd)")
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
        // Get client profile directly from the profiles view
        const { data: profile } = await supabase
          .from("profiles")
          .select("id, email, first_name")
          .eq("id", sub.user_id)
          .maybeSingle();

        if (!profile?.email) continue;

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
        const price = serviceData?.price_kwd;
        const renewalDate = billingDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        });
        const billingUrl = AUTH_REDIRECT_URLS.billingPay;

        const detailItems = [
          { label: 'Program', value: serviceName },
          { label: 'Renewal Date', value: renewalDate },
        ];
        if (price) {
          detailItems.push({ label: 'Amount', value: `${price} KWD` });
        }

        const content = [
          greeting(firstName),
          paragraph(`Just a heads-up -- your <strong>${serviceName}</strong> subscription will renew on <strong>${renewalDate}</strong>.`),
          detailCard('Renewal Details', detailItems),
          paragraph("No action is needed if you'd like to continue -- your payment will be processed automatically. If you need to update your payment method, you can do so from your billing page."),
          ctaButton('View Billing Details', billingUrl),
          signOff(),
        ].join('');

        const html = wrapInLayout({
          content,
          preheader: `Your ${serviceName} subscription renews on ${renewalDate}${price ? ` -- ${price} KWD` : ''}.`,
        });

        const result = await sendEmail({
          from: EMAIL_FROM_BILLING,
          to: profile.email,
          subject: `Upcoming renewal: ${serviceName}`,
          html,
          replyTo: REPLY_TO_SUPPORT,
        });

        await supabase.from("email_notifications").insert({
          user_id: sub.user_id,
          notification_type: notificationType,
          status: result.success ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (result.success) {
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
