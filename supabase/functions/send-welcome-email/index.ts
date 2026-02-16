import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { APP_BASE_URL, EMAIL_FROM, SUPPORT_EMAIL } from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, ctaButton, alertBox, orderedList, signOff, detailCard } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  firstName: string;
  serviceName: string;
  status: string;
  paymentDeadline?: string;
  needsMedicalReview?: boolean;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      email,
      firstName,
      serviceName,
      status,
      paymentDeadline,
      needsMedicalReview
    }: WelcomeEmailRequest = await req.json();

    console.log("Sending welcome email to:", email);

    let subject: string;
    let preheader: string;
    let statusContent: string;

    if (needsMedicalReview) {
      subject = "Your Application is Under Review";
      preheader = "Our team is reviewing your health questionnaire for safety.";
      statusContent = [
        alertBox('<strong>Medical Review Required</strong><br>Based on your PAR-Q responses, our team needs to review your application for safety. We\'ll contact you within 24-48 hours.', 'warning'),
        paragraph('<strong>What Happens Next?</strong>'),
        orderedList([
          'Our medical team will review your responses',
          'We may reach out for additional information if needed',
          'Once approved, you\'ll receive payment instructions',
          'After payment, you\'ll be matched with your coach',
        ]),
      ].join('');
    } else if (status === "pending_payment" && paymentDeadline) {
      const deadline = new Date(paymentDeadline);
      const formattedDeadline = deadline.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      subject = "Welcome to IGU -- Complete Your Payment to Start";
      preheader = `Complete payment by ${formattedDeadline} to secure your spot.`;
      statusContent = [
        alertBox(`<strong>Complete Your Payment</strong><br>You have until <strong>${formattedDeadline}</strong> to complete your payment and secure your spot!`, 'info'),
        paragraph('<strong>Next Steps:</strong>'),
        orderedList([
          '<strong>Complete Payment:</strong> Log into your dashboard and click the payment button',
          '<strong>Coach Assignment:</strong> Once payment is confirmed, we\'ll match you with your coach',
          '<strong>Get Started:</strong> Your coach will reach out within 24 hours to begin your journey',
        ]),
        ctaButton('Complete Payment Now', `${APP_BASE_URL}/dashboard`),
      ].join('');
    } else {
      subject = "Welcome to IGU -- Your Coach Will Be in Touch";
      preheader = "Your application is submitted. Your coach will review it within 24-48 hours.";
      statusContent = [
        alertBox('<strong>Application Submitted Successfully</strong><br>Your coach will review your application and reach out within 24-48 hours.', 'success'),
        paragraph('<strong>What to Expect:</strong>'),
        orderedList([
          '<strong>Coach Review:</strong> Your assigned coach will review your training goals and preferences',
          '<strong>First Contact:</strong> Expect a message from your coach within 24-48 hours',
          '<strong>Program Setup:</strong> Your coach will create a personalized program for you',
          '<strong>Get Started:</strong> Begin your transformation journey!',
        ]),
      ].join('');
    }

    const content = [
      greeting(firstName),
      paragraph(`Thank you for choosing <strong>${serviceName}</strong>! We're excited to be part of your fitness journey.`),
      statusContent,
      detailCard('Stay Connected', [
        { label: 'Dashboard', value: `<a href="${APP_BASE_URL}/dashboard" style="color: #d91449;">Log in to your dashboard</a>` },
        { label: 'Support', value: `<a href="mailto:${SUPPORT_EMAIL}" style="color: #d91449;">${SUPPORT_EMAIL}</a>` },
      ]),
      signOff(),
    ].join('');

    const html = wrapInLayout({ content, preheader });

    const result = await sendEmail({
      from: EMAIL_FROM,
      to: email,
      subject,
      html,
    });

    if (!result.success) {
      throw new Error(`Email failed: ${result.error}`);
    }

    console.log("Welcome email sent successfully");

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error sending welcome email:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
