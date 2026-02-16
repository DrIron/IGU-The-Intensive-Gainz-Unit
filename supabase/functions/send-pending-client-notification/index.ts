import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { APP_BASE_URL, EMAIL_FROM } from "../_shared/config.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, banner, detailCard, ctaButton, signOff, alertBox, statCard, statGrid } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PendingClientNotificationRequest {
  coachUserId: string;
  coachId?: string;
  coachEmail?: string;
  coachFirstName: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail?: string;
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

    const content = [
      banner('New Client Awaiting Approval', 'A new client has selected you as their coach'),
      greeting(coachFirstName),
      paragraph('A new client has selected you and is waiting for your approval.'),
      detailCard('Client Details', [
        { label: 'Name', value: clientFullName },
        { label: 'Service', value: serviceName },
      ]),
      pendingCount && pendingCount > 1
        ? statGrid([statCard('Total Pending Approvals', pendingCount, true)])
        : '',
      alertBox(
        '<strong>What happens next?</strong><br>Accept: The client will be added to your active roster<br>Reject: The client will be notified to select another coach',
        'info'
      ),
      ctaButton('Review Pending Clients', dashboardUrl),
      signOff(),
    ].join('');

    const html = wrapInLayout({
      content,
      preheader: `${clientFullName} is waiting for your approval -- ${serviceName}`,
    });

    const result = await sendEmail({
      from: EMAIL_FROM,
      to: coachEmail,
      subject: `New Client Awaiting Your Approval - ${clientFullName}`,
      html,
    });

    if (!result.success) {
      throw new Error(`Resend API error: ${result.error}`);
    }

    console.log("Pending client notification sent successfully:", result.id);

    return new Response(
      JSON.stringify({ success: true, emailResult: result }),
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
