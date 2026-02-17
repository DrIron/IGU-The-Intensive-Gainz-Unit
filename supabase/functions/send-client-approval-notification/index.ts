import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { APP_BASE_URL, AUTH_REDIRECT_URLS, EMAIL_FROM } from '../_shared/config.ts';
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, banner, detailCard, alertBox, ctaButton, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApprovalNotificationRequest {
  userId: string;
  coachId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, coachId }: ApprovalNotificationRequest = await req.json();

    if (!userId || !coachId) {
      console.error('Missing required parameters:', { userId, coachId });
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing approval notification for user ${userId} from coach ${coachId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get client information
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, first_name, full_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Error fetching client profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get coach basic info from coaches table (no PII)
    const { data: coach, error: coachError } = await supabase
      .from('coaches')
      .select('id, first_name, last_name')
      .eq('user_id', coachId)
      .single();

    if (coachError || !coach) {
      console.error('Error fetching coach:', coachError);
      return new Response(
        JSON.stringify({ error: 'Coach not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get coach email from coaches_private (server-side only, never returned to client)
    const { data: coachContact } = await supabase
      .from('coaches_private')
      .select('email')
      .eq('coach_public_id', coach.id)
      .maybeSingle();

    // Get subscription information
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('services!inner(name, price_kwd)')
      .eq('user_id', userId)
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) {
      console.error('Error fetching subscription:', subError);
    }

    const clientName = profile.first_name || profile.full_name || profile.email;
    const serviceName = (subscription as any)?.services?.name || 'your program';
    const servicePrice = (subscription as any)?.services?.price_kwd || 0;
    const coachName = `${coach.first_name} ${coach.last_name}`;
    const dashboardUrl = AUTH_REDIRECT_URLS.dashboard;

    const content = [
      banner("You're Approved!", "You're one step closer to starting your fitness journey"),
      greeting(clientName),
      paragraph('Your coach has reviewed and approved your application. Complete your payment to get started!'),
      detailCard('Your Details', [
        { label: 'Coach', value: coachName },
        { label: 'Program', value: serviceName },
        { label: 'Monthly Fee', value: `${servicePrice} KWD` },
      ]),
      alertBox('<strong>Next Step: Complete Payment</strong><br>To secure your spot and begin training, please complete your payment within the next 7 days. After payment, your coach will reach out to get you started!', 'warning'),
      ctaButton('Complete Payment Now', dashboardUrl),
      signOff(),
    ].join('');

    const html = wrapInLayout({
      content,
      preheader: 'Your coach approved your application. Complete payment to start training.',
    });

    const result = await sendEmail({
      from: EMAIL_FROM,
      to: profile.email,
      subject: "You're Approved -- Complete Payment to Start",
      html,
    });

    const emailStatus = result.success ? 'sent' : 'failed';
    const emailId = result.id || null;

    if (!result.success) {
      console.error('Error sending email:', result.error);
    } else {
      console.log('Email sent successfully:', result.id);
    }

    // Track email notification in database
    try {
      const { error: notificationError } = await supabase
        .from('email_notifications')
        .insert({
          user_id: userId,
          notification_type: 'client_approved',
          status: emailStatus,
          sent_at: new Date().toISOString()
        });

      if (notificationError) {
        console.error('Error logging email notification:', notificationError);
      }
    } catch (logError) {
      console.error('Failed to log email notification:', logError);
    }

    // ============================
    // ZAPIER NOTIFICATION (NON-BLOCKING)
    // ============================
    try {
      // Get subscription details for Zapier
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('id, status, service_id, services!inner(name, type)')
        .eq('user_id', userId)
        .eq('coach_id', coachId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // NOTE: We do NOT send coach email to Zapier - use coach_id for lookups
      await supabase.functions.invoke('notify-zapier', {
        body: {
          event_type: 'coach_approved_client',
          user_id: userId,
          profile_id: userId,
          profile_email: profile.email,
          profile_status: 'pending_payment',
          subscription_id: subData?.id ?? null,
          subscription_status: subData?.status ?? 'pending',
          service_id: subData?.service_id ?? null,
          service_name: (subData as any)?.services?.name ?? serviceName,
          coach_id: coachId,
          notes: 'Coach approved 1:1 client',
          metadata: {
            previous_status: 'pending_coach_approval',
            new_status: 'pending_payment',
            service_type: (subData as any)?.services?.type ?? null,
          },
        },
      });
      console.log('Zapier notification sent for coach_approved_client');
    } catch (zapierError) {
      console.error('Zapier notification failed (non-critical):', zapierError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Approval notification sent successfully',
        emailId,
        emailStatus
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-client-approval-notification:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: errorMessage
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
};

serve(handler);
