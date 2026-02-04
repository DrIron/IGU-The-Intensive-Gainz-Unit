import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { applicantEmail, applicantName, type, notes } = await req.json();

    if (!applicantEmail || !applicantName || !type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let subject = "";
    let html = "";

    if (type === "received") {
      subject = "Coach Application Received \u2013 IGU Coaching";
      html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .container { padding: 20px; }
    .header { background-color: #1a1a2e; color: #fff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background-color: #f8f9fa; }
    .footer { text-align: center; padding: 15px; color: #666; font-size: 12px; }
    h1 { margin: 0; font-size: 24px; }
    p { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Received</h1>
    </div>
    <div class="content">
      <p>Dear ${applicantName},</p>
      <p>Thank you for applying to join the IGU Coaching team!</p>
      <p>We have received your application and our team will review it shortly. We will get back to you within 3-5 business days.</p>
      <p>If you have any questions in the meantime, please don't hesitate to reach out to us.</p>
      <p>Best regards,<br>IGU Coaching Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} IGU Coaching. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `;
    } else if (type === "approved") {
      subject = "Coach Application Approved \u2013 Welcome to IGU Coaching!";
      html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .container { padding: 20px; }
    .header { background-color: #1a1a2e; color: #fff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background-color: #f8f9fa; }
    .footer { text-align: center; padding: 15px; color: #666; font-size: 12px; }
    h1 { margin: 0; font-size: 24px; }
    p { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Approved</h1>
    </div>
    <div class="content">
      <p>Dear ${applicantName},</p>
      <p>Congratulations! We are excited to inform you that your application to join IGU Coaching has been approved!</p>
      <p>You will receive a separate email shortly with instructions to set up your coach account and complete your profile.</p>
      ${notes ? `<p><strong>Notes from our team:</strong><br>${notes}</p>` : ""}
      <p>We look forward to having you on our team!</p>
      <p>Best regards,<br>IGU Coaching Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} IGU Coaching. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `;
    } else if (type === "rejected") {
      subject = "Coach Application Update \u2013 IGU Coaching";
      html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; }
    .container { padding: 20px; }
    .header { background-color: #1a1a2e; color: #fff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background-color: #f8f9fa; }
    .footer { text-align: center; padding: 15px; color: #666; font-size: 12px; }
    h1 { margin: 0; font-size: 24px; }
    p { margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Application Update</h1>
    </div>
    <div class="content">
      <p>Dear ${applicantName},</p>
      <p>Thank you for your interest in joining the IGU Coaching team and for taking the time to submit your application.</p>
      <p>After careful consideration, we regret to inform you that we are unable to move forward with your application at this time.</p>
      ${notes ? `<p><strong>Feedback:</strong><br>${notes}</p>` : ""}
      <p>We appreciate your interest and encourage you to apply again in the future if you continue to develop your skills and qualifications.</p>
      <p>Best regards,<br>IGU Coaching Team</p>
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} IGU Coaching. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
      `;
    }

    if (!RESEND_API_KEY) {
      console.log("Would send email:", { to: applicantEmail, subject });
      return new Response(
        JSON.stringify({
          success: true,
          message: "Email logged (no API key)",
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "IGU Coaching <noreply@theigu.com>",
        to: [applicantEmail],
        subject: subject,
        html: html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Resend API error:", data);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: data }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ success: true, emailId: data.id }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
