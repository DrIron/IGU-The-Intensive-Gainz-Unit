import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { APP_BASE_URL, EMAIL_FROM } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PendingClientNotificationRequest {
  coachUserId: string;
  coachId?: string; // coaches.id - optional, will fetch email from coaches_private if provided
  coachEmail?: string; // Optional - if not provided, will be fetched server-side
  coachFirstName: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail?: string; // Optional now
  serviceName: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestData: PendingClientNotificationRequest = await req.json();
    const {
      coachUserId,
      coachId,
      coachFirstName,
      clientFirstName,
      clientLastName,
      serviceName,
    } = requestData;

    // Initialize Supabase client with service role for server-side access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get coach email server-side if not provided
    let coachEmail = requestData.coachEmail;
    if (!coachEmail && coachId) {
      const { data: contactData } = await supabase
        .from('coaches_private')
        .select('email')
        .eq('coach_public_id', coachId)
        .single();
      coachEmail = contactData?.email;
    }

    if (!coachEmail) {
      console.error('Could not find coach email for notification');
      return new Response(
        JSON.stringify({ error: 'Coach email not found' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log('Sending pending client notification to coach:', coachEmail);

    // Get count of pending approvals for this coach
    const { count: pendingCount } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('coach_id', coachUserId)
      .eq('status', 'pending_coach_approval');

    const clientFullName = `${clientFirstName} ${clientLastName}`.trim();
    const dashboardUrl = `${APP_BASE_URL}/dashboard`;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 30px;
              border-radius: 10px 10px 0 0;
              text-align: center;
            }
            .content {
              background: #f8f9fa;
              padding: 30px;
              border-radius: 0 0 10px 10px;
            }
            .client-card {
              background: white;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #667eea;
            }
            .client-info {
              margin: 10px 0;
            }
            .client-info strong {
              color: #667eea;
            }
            .cta-button {
              display: inline-block;
              background: #667eea;
              color: white;
              padding: 15px 30px;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 600;
              margin: 20px 0;
              text-align: center;
            }
            .cta-button:hover {
              background: #5568d3;
            }
            .stats {
              background: white;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              text-align: center;
            }
            .stats-number {
              font-size: 32px;
              font-weight: bold;
              color: #667eea;
            }
            .footer {
              text-align: center;
              color: #666;
              font-size: 12px;
              margin-top: 30px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0;">🎉 New Client Awaiting Approval!</h1>
          </div>
          
          <div class="content">
            <p>Hi ${coachFirstName},</p>
            
            <p>Great news! A new client has selected you as their coach and is waiting for your approval.</p>
            
            <div class="client-card">
              <h2 style="margin-top: 0; color: #333;">Client Details</h2>
              <div class="client-info">
                <strong>Name:</strong> ${clientFullName}
              </div>
              <div class="client-info">
                <strong>Service:</strong> ${serviceName}
              </div>
            </div>

            ${pendingCount && pendingCount > 1 ? `
            <div class="stats">
              <div class="stats-number">${pendingCount}</div>
              <div>Total Pending Approvals</div>
            </div>
            ` : ''}
            
            <p>Please review this client's application and decide whether to accept or reject them based on your current capacity and schedule.</p>
            
            <div style="text-align: center;">
              <a href="${dashboardUrl}" class="cta-button">
                Review Pending Clients
              </a>
            </div>
            
            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 14px;">
              <strong>What happens next?</strong><br>
              • Accept: The client will be added to your active roster<br>
              • Reject: The client will be notified to select another coach
            </p>
            
            <div class="footer">
              <p>This is an automated notification from your coaching platform.</p>
              <p>If you have any questions, please contact support.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    // Send email using Resend API
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [coachEmail],
        subject: `New Client Awaiting Your Approval - ${clientFullName}`,
        html: emailHtml,
      }),
    });

    const emailResult = await emailResponse.json();

    if (!emailResponse.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(emailResult)}`);
    }

    console.log("Pending client notification sent successfully:", emailResult);

    return new Response(
      JSON.stringify({ success: true, emailResult }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-pending-client-notification function:", error);
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
