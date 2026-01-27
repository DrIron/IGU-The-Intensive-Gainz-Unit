import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { APP_BASE_URL, EMAIL_FROM } from "../_shared/config.ts";

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

    let subject = "Welcome to IGU Coaching! 🎉";
    let nextSteps = "";

    if (needsMedicalReview) {
      subject = "Your Application is Under Review";
      nextSteps = `
        <div style="background-color: #fff3cd; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h3 style="margin: 0 0 8px 0; color: #856404;">⚕️ Medical Review Required</h3>
          <p style="margin: 0; color: #856404;">Based on your PAR-Q responses, our team needs to review your application for safety. We'll contact you within 24-48 hours.</p>
        </div>
        <h2 style="color: #333; margin-top: 24px;">What Happens Next?</h2>
        <ol style="color: #666; line-height: 1.8;">
          <li>Our medical team will review your responses</li>
          <li>We may reach out for additional information if needed</li>
          <li>Once approved, you'll receive payment instructions</li>
          <li>After payment, you'll be matched with your coach</li>
        </ol>
      `;
    } else if (status === "pending_payment" && paymentDeadline) {
      const deadline = new Date(paymentDeadline);
      const formattedDeadline = deadline.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      nextSteps = `
        <div style="background-color: #d1ecf1; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #17a2b8;">
          <h3 style="margin: 0 0 8px 0; color: #0c5460;">⏰ Complete Your Payment</h3>
          <p style="margin: 0; color: #0c5460;">You have until <strong>${formattedDeadline}</strong> to complete your payment and secure your spot!</p>
        </div>
        <h2 style="color: #333; margin-top: 24px;">Next Steps:</h2>
        <ol style="color: #666; line-height: 1.8;">
          <li><strong>Complete Payment:</strong> Log into your dashboard and click the payment button</li>
          <li><strong>Coach Assignment:</strong> Once payment is confirmed, we'll match you with your coach</li>
          <li><strong>Get Started:</strong> Your coach will reach out within 24 hours to begin your journey</li>
        </ol>
        <div style="margin: 24px 0;">
          <a href="${APP_BASE_URL}/dashboard" 
             style="display: inline-block; background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Complete Payment Now →
          </a>
        </div>
      `;
    } else if (status === "pending_coach_approval") {
      nextSteps = `
        <div style="background-color: #d4edda; padding: 16px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #28a745;">
          <h3 style="margin: 0 0 8px 0; color: #155724;">✅ Application Submitted Successfully</h3>
          <p style="margin: 0; color: #155724;">Your coach will review your application and reach out within 24-48 hours.</p>
        </div>
        <h2 style="color: #333; margin-top: 24px;">What to Expect:</h2>
        <ol style="color: #666; line-height: 1.8;">
          <li><strong>Coach Review:</strong> Your assigned coach will review your training goals and preferences</li>
          <li><strong>First Contact:</strong> Expect a message from your coach within 24-48 hours</li>
          <li><strong>Program Setup:</strong> Your coach will create a personalized program for you</li>
          <li><strong>Get Started:</strong> Begin your transformation journey!</li>
        </ol>
      `;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 32px;">🏋️ IGU Coaching</h1>
            </div>
            
            <!-- Content -->
            <div style="padding: 40px 20px;">
              <h1 style="color: #333; margin-top: 0;">Welcome, ${firstName}! 🎉</h1>
              <p style="color: #666; font-size: 16px; line-height: 1.6;">
                Thank you for choosing <strong>${serviceName}</strong>! We're excited to be part of your fitness journey.
              </p>
              
              ${nextSteps}
              
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 24px 0;">
                <h3 style="color: #333; margin-top: 0;">📱 Stay Connected</h3>
                <p style="color: #666; margin-bottom: 8px;">Join our community and access your dashboard:</p>
                <ul style="color: #666; line-height: 1.8;">
                  <li>Check your email for updates from your coach</li>
                  <li>Log into your dashboard for program details</li>
                  <li>Join our Discord community (link in dashboard)</li>
                </ul>
              </div>
              
              <div style="border-top: 2px solid #f0f0f0; margin-top: 32px; padding-top: 24px;">
                <p style="color: #999; font-size: 14px; margin: 0;">
                  Need help? Reply to this email or contact us at support@igucoaching.com
                </p>
                <p style="color: #999; font-size: 14px; margin: 8px 0 0 0;">
                  <strong>IGU Coaching</strong> - Transform Your Body, Transform Your Life
                </p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY not configured");
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [email],
        subject,
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const error = await emailResponse.text();
      throw new Error(`Email failed: ${error}`);
    }

    console.log("Welcome email sent successfully");

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
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
