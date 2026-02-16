import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  EMAIL_FROM,
  REPLY_TO_SUPPORT,
  AUTH_REDIRECT_URLS,
  APP_BASE_URL,
} from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, alertBox, ctaButton, sectionHeading, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Lead nurture drip sequence.
 * Called daily by n8n. Follows up on newsletter signups (leads table)
 * who haven't converted to users.
 *
 * Day 2: "Here's what IGU can do for you" (value proposition)
 * Day 5: "Meet our coaches" (social proof)
 * Day 10: "Limited-time offer" (urgency)
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
      leads_checked: 0,
      emails_sent: 0,
      already_sent: 0,
      already_converted: 0,
      errors: [] as string[],
    };

    // Fetch unconverted leads older than 1 day
    const oneDayAgo = new Date(
      now.getTime() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: leads, error: fetchError } = await supabase
      .from("leads")
      .select("id, email, name, source, created_at, converted_to_user_id")
      .is("converted_to_user_id", null)
      .lt("created_at", oneDayAgo);

    if (fetchError) {
      throw new Error(`Failed to fetch leads: ${fetchError.message}`);
    }

    if (!leads || leads.length === 0) {
      console.log("No unconverted leads found");
      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    results.leads_checked = leads.length;

    for (const lead of leads) {
      try {
        // Double-check the lead hasn't signed up (check auth.users by email)
        const { data: existingUser } = await supabase
          .from("profiles")
          .select("id")
          .eq("email", lead.email)
          .maybeSingle();

        if (existingUser) {
          // Mark as converted
          await supabase
            .from("leads")
            .update({
              converted_to_user_id: existingUser.id,
              converted_at: new Date().toISOString(),
            })
            .eq("id", lead.id);
          results.already_converted++;
          continue;
        }

        const createdAt = new Date(lead.created_at);
        const daysSinceSignup = Math.floor(
          (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000)
        );

        // Determine which drip step to send
        let notificationType: string | null = null;
        if (daysSinceSignup >= 10) {
          notificationType = "lead_nurture_day10";
        } else if (daysSinceSignup >= 5) {
          notificationType = "lead_nurture_day5";
        } else if (daysSinceSignup >= 2) {
          notificationType = "lead_nurture_day2";
        }

        if (!notificationType) continue;

        // Check if already sent (use lead email as key since they don't have user_id)
        const { data: existing } = await supabase
          .from("email_notifications")
          .select("id")
          .eq("notification_type", notificationType)
          .eq("user_id", lead.id)
          .maybeSingle();

        if (existing) {
          results.already_sent++;
          continue;
        }

        const firstName = lead.name?.split(" ")[0] || "there";
        const { subject, preheader, content } = buildEmailContent(notificationType, firstName);

        const html = wrapInLayout({
          content,
          preheader,
          showUnsubscribe: true,
        });

        const result = await sendEmail({
          from: EMAIL_FROM,
          to: lead.email,
          subject,
          html,
          replyTo: REPLY_TO_SUPPORT,
        });

        // Use lead.id as user_id for dedup (leads don't have auth user_ids)
        await supabase.from("email_notifications").insert({
          user_id: lead.id,
          notification_type: notificationType,
          status: result.success ? "sent" : "failed",
          sent_at: new Date().toISOString(),
        });

        if (result.success) {
          results.emails_sent++;
          console.log(
            `Sent ${notificationType} to ${lead.email} (day ${daysSinceSignup})`
          );
        } else {
          results.errors.push(`${lead.email}: ${notificationType} failed`);
        }
      } catch (err: any) {
        console.error(`Error processing lead ${lead.id}:`, err);
        results.errors.push(`lead ${lead.id}: ${err.message}`);
      }
    }

    console.log("Lead nurture check completed:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in process-lead-nurture:", error);
    return new Response(
      JSON.stringify({ error: "Lead nurture check failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function buildEmailContent(
  notificationType: string,
  firstName: string
): { subject: string; preheader: string; content: string } {
  const servicesUrl = AUTH_REDIRECT_URLS.services;
  const teamUrl = `${APP_BASE_URL}/meet-our-team`;
  const signupUrl = `${AUTH_REDIRECT_URLS.auth}?tab=signup`;

  switch (notificationType) {
    case "lead_nurture_day2":
      return {
        subject: "Here's what IGU can do for you",
        preheader: "Personalized programs, expert coaches, and full tracking -- all in one platform.",
        content: [
          greeting(firstName),
          paragraph("Thanks for signing up for updates from IGU! We wanted to share what makes our coaching different."),
          sectionHeading('What You Get with IGU'),
          paragraph('<strong>Personalized Programs</strong> -- Every workout is built specifically for your goals and experience level'),
          paragraph('<strong>Expert Coaches</strong> -- Work 1:1 with certified coaches who specialize in your goals'),
          paragraph('<strong>Full Tracking</strong> -- Log workouts, track progress, and see real results over time'),
          paragraph('<strong>Nutrition Support</strong> -- Optional dietitian-led nutrition coaching for complete results'),
          ctaButton('Explore Our Programs', servicesUrl),
          signOff(),
        ].join(''),
      };

    case "lead_nurture_day5":
      return {
        subject: "Meet the coaches behind IGU",
        preheader: "Hand-picked, certified coaches specializing in bodybuilding, powerlifting, nutrition and more.",
        content: [
          greeting(firstName),
          paragraph("The right coach makes all the difference. At IGU, every coach is hand-picked and brings real expertise to help you reach your goals."),
          alertBox('<strong>Our team:</strong> Certified coaches specializing in bodybuilding, powerlifting, nutrition and more', 'info'),
          paragraph("When you sign up, we'll match you with the coach who best fits your goals, training style, and schedule."),
          ctaButton('Meet Our Coaches', teamUrl),
          signOff(),
        ].join(''),
      };

    case "lead_nurture_day10":
      return {
        subject: "Ready to start your transformation?",
        preheader: "Plans start from 12 KWD/month. No contracts, cancel anytime.",
        content: [
          greeting(firstName),
          paragraph("We know choosing a coaching program is a big decision. That's why we make it easy to get started -- no long-term contracts, cancel anytime."),
          alertBox('<strong>Plans start from just 12 KWD/month</strong> for team coaching. 1:1 online coaching with a dedicated personal coach starts at 50 KWD/month.', 'success'),
          paragraph("The onboarding takes just a few minutes -- we'll ask about your goals, match you with the perfect coach, and get your first program ready."),
          ctaButton('Start Your Journey', signupUrl),
          paragraph("Have questions? Simply reply to this email and we'll be happy to help."),
          signOff(),
        ].join(''),
      };

    default:
      return { subject: "", preheader: "", content: "" };
  }
}
