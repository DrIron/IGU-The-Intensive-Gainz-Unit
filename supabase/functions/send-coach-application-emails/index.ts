import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";
import { EMAIL_FROM_COACHING, SUPPORT_EMAIL, APP_BASE_URL } from "../_shared/config.ts";
import { wrapInLayout } from "../_shared/emailTemplate.ts";
import { greeting, paragraph, alertBox, signOff, detailCard } from "../_shared/emailComponents.ts";
import { sendEmail } from "../_shared/sendEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Escape HTML special characters to prevent injection in email templates */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Rate limit: 5 requests per minute per IP
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip, 5, 60_000);
  if (!rateCheck.allowed) {
    return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
  }

  try {
    const { applicantEmail, applicantName: rawName, type, notes: rawNotes, turnstileToken } = await req.json();

    if (!applicantEmail || !rawName || !type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Sanitize user-provided strings before interpolating into HTML
    const applicantName = escapeHtml(String(rawName));
    const notes = rawNotes ? escapeHtml(String(rawNotes)) : null;

    // Verify Turnstile token for "received" type (initial application from anonymous user)
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (type === "received" && turnstileSecret) {
      if (!turnstileToken) {
        return new Response(
          JSON.stringify({ error: "Bot verification required" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const verifyRes = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: turnstileSecret,
            response: turnstileToken,
          }),
        }
      );
      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        console.warn("Turnstile verification failed:", verifyData);
        return new Response(
          JSON.stringify({ error: "Bot verification failed. Please refresh and try again." }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    let subject = "";
    let content = "";
    let preheader = "";

    if (type === "received") {
      subject = "Coach Application Received -- IGU";
      preheader = "We've received your application and will review it shortly.";
      content = [
        greeting(applicantName),
        paragraph("Thank you for applying to join the IGU Coaching team!"),
        alertBox("We have received your application and our team will review it shortly. We will get back to you within 3-5 business days.", "info"),
        paragraph(`If you have any questions in the meantime, please don't hesitate to reach out to us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #d91449;">${SUPPORT_EMAIL}</a>.`),
        signOff(),
      ].join("");
    } else if (type === "approved") {
      subject = "Coach Application Approved -- Welcome to IGU!";
      preheader = "Congratulations! Your application has been approved.";
      content = [
        greeting(applicantName),
        alertBox("<strong>Your application has been approved!</strong><br>Congratulations -- we are excited to have you on the IGU Coaching team!", "success"),
        paragraph("You will receive a separate email shortly with instructions to set up your coach account and complete your profile."),
        ...(notes ? [detailCard("Notes from Our Team", [{ label: "Feedback", value: notes }])] : []),
        paragraph("We look forward to having you on our team!"),
        signOff(),
      ].join("");
    } else if (type === "rejected") {
      subject = "Coach Application Update -- IGU";
      preheader = "An update on your coach application.";
      content = [
        greeting(applicantName),
        paragraph("Thank you for your interest in joining the IGU Coaching team and for taking the time to submit your application."),
        alertBox("After careful consideration, we are unable to move forward with your application at this time.", "error"),
        ...(notes ? [detailCard("Feedback", [{ label: "Details", value: notes }])] : []),
        paragraph("We appreciate your interest and encourage you to apply again in the future if you continue to develop your skills and qualifications."),
        signOff(),
      ].join("");
    }

    const html = wrapInLayout({ content, preheader });

    const result = await sendEmail({
      from: EMAIL_FROM_COACHING,
      to: applicantEmail,
      subject,
      html,
    });

    if (!result.success) {
      console.error("Email send failed:", result.error);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: result.error }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailId: result.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "An error occurred. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
