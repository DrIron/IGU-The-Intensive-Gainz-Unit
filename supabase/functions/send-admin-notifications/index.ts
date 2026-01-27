import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { EMAIL_FROM_ADMIN, APP_BASE_URL, REPLY_TO_ADMIN } from "../_shared/config.ts";

const resendApiKey = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotificationRequest {
  type: 'pending_approval' | 'payment_failure' | 'legal_issue' | 'upcoming_renewal';
  adminEmail: string;
  data: {
    clientName: string;
    clientEmail: string;
    signupDate?: string;
    failureDate?: string;
    serviceName?: string;
    missingDocuments?: string[];
    renewalDate?: string;
    priceKwd?: string;
  };
}

const getEmailTemplate = (type: string, data: any, dashboardUrl: string): { subject: string; html: string } => {
  switch (type) {
    case 'pending_approval':
      return {
        subject: `New Client Pending Approval: ${data.clientName}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f6f9fc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f9fc; padding: 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; padding: 40px;">
        <tr><td>
          <h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 28px;">⏳ New Client Pending Approval</h1>
          <p style="margin: 16px 0; color: #525252; font-size: 16px;">A new client has signed up and is waiting for approval:</p>
          <div style="background-color: #f9fafb; border-radius: 6px; padding: 16px; margin: 24px 0;">
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Name:</strong> ${data.clientName}</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Email:</strong> ${data.clientEmail}</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Signup Date:</strong> ${data.signupDate}</p>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding: 24px 0;">
              <a href="${dashboardUrl}" style="background-color: #0070f3; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Review & Approve</a>
            </td></tr>
          </table>
          <p style="margin: 16px 0; color: #737373; font-size: 14px;">Please review their application and assign a coach to activate their account.</p>
          <p style="margin: 32px 0 0 0; color: #898989; font-size: 12px;">Iron Performance Admin Dashboard</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
      };

    case 'payment_failure':
      return {
        subject: `⚠️ Payment Failure Alert: ${data.clientName}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f6f9fc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f9fc; padding: 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; padding: 40px;">
        <tr><td>
          <h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 28px;">⚠️ Payment Failure Alert</h1>
          <p style="margin: 16px 0; color: #525252; font-size: 16px;">A client's payment has failed and requires immediate attention:</p>
          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 6px; padding: 16px; margin: 24px 0;">
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Client:</strong> ${data.clientName}</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Email:</strong> ${data.clientEmail}</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Service:</strong> ${data.serviceName}</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Failure Date:</strong> ${data.failureDate}</p>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding: 24px 0;">
              <a href="${dashboardUrl}" style="background-color: #ef4444; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">View Details & Take Action</a>
            </td></tr>
          </table>
          <p style="margin: 16px 0; color: #737373; font-size: 14px;">Please contact the client to resolve the payment issue or suspend their account if necessary.</p>
          <p style="margin: 32px 0 0 0; color: #898989; font-size: 12px;">Iron Performance Admin Dashboard</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
      };

    case 'legal_issue':
      const docsList = data.missingDocuments?.map((doc: string) => `<li style="margin: 4px 0; color: #1a1a1a; font-size: 14px;">${doc}</li>`).join('');
      return {
        subject: `Legal Documents Alert: ${data.clientName}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f6f9fc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f9fc; padding: 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; padding: 40px;">
        <tr><td>
          <h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 28px;">📋 Legal Documents Alert</h1>
          <p style="margin: 16px 0; color: #525252; font-size: 16px;">A client has not accepted required legal documents:</p>
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 16px; margin: 24px 0;">
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Client:</strong> ${data.clientName}</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Email:</strong> ${data.clientEmail}</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Missing Documents:</strong></p>
            <ul style="margin: 8px 0; padding-left: 20px;">${docsList}</ul>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding: 24px 0;">
              <a href="${dashboardUrl}" style="background-color: #f59e0b; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">Review Client Details</a>
            </td></tr>
          </table>
          <p style="margin: 16px 0; color: #737373; font-size: 14px;">Please contact the client to ensure all legal documents are accepted before proceeding with onboarding.</p>
          <p style="margin: 32px 0 0 0; color: #898989; font-size: 12px;">Iron Performance Admin Dashboard</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
      };

    case 'upcoming_renewal':
      return {
        subject: `Upcoming Renewal: ${data.clientName}`,
        html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f6f9fc;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f9fc; padding: 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; padding: 40px;">
        <tr><td>
          <h1 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 28px;">🔄 Upcoming Subscription Renewal</h1>
          <p style="margin: 16px 0; color: #525252; font-size: 16px;">A client's subscription is scheduled to renew in the next 7 days:</p>
          <div style="background-color: #f0f9ff; border-left: 4px solid #0ea5e9; border-radius: 6px; padding: 16px; margin: 24px 0;">
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Client:</strong> ${data.clientName}</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Email:</strong> ${data.clientEmail}</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Service:</strong> ${data.serviceName}</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Amount:</strong> ${data.priceKwd} KWD</p>
            <p style="margin: 8px 0; color: #1a1a1a; font-size: 14px;"><strong>Renewal Date:</strong> ${data.renewalDate}</p>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding: 24px 0;">
              <a href="${dashboardUrl}" style="background-color: #0ea5e9; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">View Client Details</a>
            </td></tr>
          </table>
          <p style="margin: 16px 0; color: #737373; font-size: 14px;">Please ensure the client is aware of the upcoming renewal and their payment method is up to date.</p>
          <p style="margin: 32px 0 0 0; color: #898989; font-size: 12px;">Iron Performance Admin Dashboard</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
      };

    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, adminEmail, data }: NotificationRequest = await req.json();
    
    console.log(`Processing admin notification: ${type}`);

    const dashboardUrl = `${APP_BASE_URL}/dashboard`;
    const { subject, html } = getEmailTemplate(type, data, dashboardUrl);

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM_ADMIN,
        to: [adminEmail],
        subject,
        html,
        reply_to: REPLY_TO_ADMIN,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      console.error("Error sending email:", error);
      throw new Error(`Failed to send email: ${error}`);
    }

    console.log(`Admin notification sent successfully: ${type}`);

    return new Response(
      JSON.stringify({ success: true, type }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-admin-notifications function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
