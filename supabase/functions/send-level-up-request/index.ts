import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { wrapInLayout, EMAIL_BRAND } from "../_shared/emailTemplate.ts";
import { greeting, paragraph, sectionHeading, detailCard, divider, signOff } from "../_shared/emailComponents.ts";
import { sendEmail } from "../_shared/sendEmail.ts";
import { EMAIL_FROM_ADMIN, REPLY_TO_ADMIN } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      coachName,
      coachEmail,
      currentLevel,
      targetLevel,
      mandatoryChecked,
      optionalChecked,
      certifications,
      experience,
      additionalNotes,
    } = await req.json();

    if (!coachName || !coachEmail || !targetLevel) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build email content
    const mandatoryList = (mandatoryChecked || []).map((item: string) => `<li style="margin-bottom: 4px; color: ${EMAIL_BRAND.success};">${item}</li>`).join("");
    const optionalList = (optionalChecked || []).map((item: string) => `<li style="margin-bottom: 4px; color: ${EMAIL_BRAND.primary};">${item}</li>`).join("");

    const content = [
      greeting("Admin"),
      paragraph(`<strong>${coachName}</strong> (${coachEmail}) has requested a level promotion.`),
      divider(),
      detailCard([
        { label: "Current Level", value: currentLevel.charAt(0).toUpperCase() + currentLevel.slice(1) },
        { label: "Requested Level", value: targetLevel.charAt(0).toUpperCase() + targetLevel.slice(1) },
      ]),
      sectionHeading("Mandatory Criteria Met"),
      `<ul style="margin: 0 0 16px 20px; padding: 0;">${mandatoryList || "<li>None checked</li>"}</ul>`,
      sectionHeading("Additional Qualifications"),
      `<ul style="margin: 0 0 16px 20px; padding: 0;">${optionalList || "<li>None checked</li>"}</ul>`,
      sectionHeading("Certifications & Degrees"),
      paragraph(certifications || "Not provided"),
      sectionHeading("Coaching Experience"),
      paragraph(experience || "Not provided"),
      additionalNotes ? sectionHeading("Additional Notes") : "",
      additionalNotes ? paragraph(additionalNotes) : "",
      divider(),
      paragraph("To approve or deny, go to <strong>Admin Dashboard > Pricing & Payouts > Levels</strong> and update the coach's level."),
      paragraph(`Then reply to this email thread to notify ${coachName} of the decision.`),
      signOff("IGU Platform"),
    ].join("");

    const html = wrapInLayout({
      content,
      preheader: `Level-up request from ${coachName}: ${currentLevel} → ${targetLevel}`,
    });

    const result = await sendEmail({
      from: EMAIL_FROM_ADMIN,
      to: REPLY_TO_ADMIN,
      subject: `Level-Up Request: ${coachName} — ${currentLevel} → ${targetLevel}`,
      html,
      replyTo: coachEmail,
    });

    if (!result.success) {
      throw new Error(result.error || "Failed to send email");
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-level-up-request error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
