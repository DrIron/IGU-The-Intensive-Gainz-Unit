import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { EMAIL_FROM_ADMIN, APP_BASE_URL, REPLY_TO_ADMIN } from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { paragraph, alertBox, detailCard, ctaButton, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

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

function buildNotification(type: string, data: any): { subject: string; preheader: string; content: string } {
  const dashboardUrl = `${APP_BASE_URL}/admin/dashboard`;

  switch (type) {
    case 'pending_approval':
      return {
        subject: `New Client Pending Approval: ${data.clientName}`,
        preheader: `${data.clientName} signed up and is waiting for approval.`,
        content: [
          paragraph('A new client has signed up and is waiting for approval.'),
          detailCard('Client Details', [
            { label: 'Name', value: data.clientName },
            { label: 'Email', value: data.clientEmail },
            { label: 'Signup Date', value: data.signupDate },
          ]),
          paragraph('Please review their application and assign a coach to activate their account.'),
          ctaButton('Review & Approve', dashboardUrl),
          signOff(),
        ].join(''),
      };

    case 'payment_failure':
      return {
        subject: `Payment Failure Alert: ${data.clientName}`,
        preheader: `${data.clientName}'s payment has failed and requires attention.`,
        content: [
          alertBox(`<strong>Payment Failure</strong><br>A client's payment has failed and requires immediate attention.`, 'error'),
          detailCard('Client Details', [
            { label: 'Client', value: data.clientName },
            { label: 'Email', value: data.clientEmail },
            { label: 'Service', value: data.serviceName || 'N/A' },
            { label: 'Failure Date', value: data.failureDate || 'N/A' },
          ]),
          paragraph('Please contact the client to resolve the payment issue or suspend their account if necessary.'),
          ctaButton('View Details & Take Action', dashboardUrl, 'danger'),
          signOff(),
        ].join(''),
      };

    case 'legal_issue': {
      const docsList = data.missingDocuments?.map((doc: string) => `<li style="margin: 4px 0;">${doc}</li>`).join('') || '';
      return {
        subject: `Legal Documents Alert: ${data.clientName}`,
        preheader: `${data.clientName} has not accepted required legal documents.`,
        content: [
          alertBox('<strong>Legal Documents Alert</strong><br>A client has not accepted required legal documents.', 'warning'),
          detailCard('Client Details', [
            { label: 'Client', value: data.clientName },
            { label: 'Email', value: data.clientEmail },
          ]),
          paragraph(`<strong>Missing Documents:</strong><ul style="margin: 8px 0; padding-left: 20px;">${docsList}</ul>`),
          paragraph('Please contact the client to ensure all legal documents are accepted before proceeding with onboarding.'),
          ctaButton('Review Client Details', dashboardUrl, 'secondary'),
          signOff(),
        ].join(''),
      };
    }

    case 'upcoming_renewal':
      return {
        subject: `Upcoming Renewal: ${data.clientName}`,
        preheader: `${data.clientName}'s subscription renews on ${data.renewalDate}.`,
        content: [
          alertBox(`<strong>Upcoming Subscription Renewal</strong><br>A client's subscription is scheduled to renew in the next 7 days.`, 'info'),
          detailCard('Renewal Details', [
            { label: 'Client', value: data.clientName },
            { label: 'Email', value: data.clientEmail },
            { label: 'Service', value: data.serviceName || 'N/A' },
            { label: 'Amount', value: `${data.priceKwd} KWD` },
            { label: 'Renewal Date', value: data.renewalDate || 'N/A' },
          ]),
          paragraph('Please ensure the client is aware of the upcoming renewal and their payment method is up to date.'),
          ctaButton('View Client Details', dashboardUrl),
          signOff(),
        ].join(''),
      };

    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, adminEmail, data }: NotificationRequest = await req.json();

    console.log(`Processing admin notification: ${type}`);

    const { subject, preheader, content } = buildNotification(type, data);
    const html = wrapInLayout({ content, preheader });

    const result = await sendEmail({
      from: EMAIL_FROM_ADMIN,
      to: adminEmail,
      subject,
      html,
      replyTo: REPLY_TO_ADMIN,
    });

    if (!result.success) {
      throw new Error(`Failed to send email: ${result.error}`);
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
