import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { APP_BASE_URL, AUTH_REDIRECT_URLS, EMAIL_FROM } from '../_shared/config.ts';

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
    // Always use production URL for email links
    const dashboardUrl = AUTH_REDIRECT_URLS.dashboard;

    // Send email notification
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [profile.email],
        subject: '🎉 Your Coach Has Approved Your Application!',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
            <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
              <div style="text-align: center; margin-bottom: 24px;">
                <h1 style="color: #2d3748; font-size: 28px; margin: 0 0 8px 0;">🎉 Great News!</h1>
                <div style="width: 60px; height: 4px; background: linear-gradient(90deg, #4CAF50, #8BC34A); margin: 0 auto; border-radius: 2px;"></div>
              </div>
              
              <p style="color: #4a5568; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
                Hi ${clientName},
              </p>
              
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
                <p style="color: white; font-size: 18px; font-weight: bold; margin: 0 0 8px 0;">
                  Your coach has approved your application!
                </p>
                <p style="color: rgba(255,255,255,0.9); font-size: 14px; margin: 0;">
                  You're one step closer to starting your fitness journey
                </p>
              </div>
              
              <div style="background-color: #f7fafc; border-radius: 8px; padding: 20px; margin: 24px 0;">
                <h2 style="color: #2d3748; font-size: 18px; margin: 0 0 16px 0;">📋 Your Details</h2>
                <div style="border-left: 3px solid #4CAF50; padding-left: 16px;">
                  <p style="color: #4a5568; font-size: 14px; margin: 8px 0;">
                    <strong>Coach:</strong> ${coachName}
                  </p>
                  <p style="color: #4a5568; font-size: 14px; margin: 8px 0;">
                    <strong>Program:</strong> ${serviceName}
                  </p>
                  <p style="color: #4a5568; font-size: 14px; margin: 8px 0;">
                    <strong>Monthly Fee:</strong> ${servicePrice} KWD
                  </p>
                </div>
              </div>
              
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px; padding: 16px; margin: 24px 0;">
                <h3 style="color: #856404; font-size: 16px; margin: 0 0 8px 0;">⏰ Next Step: Complete Payment</h3>
                <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.5;">
                  To secure your spot and begin training, please complete your payment within the next 7 days. After payment, your coach will reach out to get you started!
                </p>
              </div>
              
              <div style="text-align: center; margin: 32px 0 24px 0;">
                <a href="${dashboardUrl}" 
                   style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
                  Complete Payment Now →
                </a>
              </div>
              
              <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 32px;">
                <p style="color: #718096; font-size: 14px; line-height: 1.6; margin: 0;">
                  If you have any questions, feel free to reach out to us or your coach.
                </p>
                <p style="color: #4a5568; font-size: 16px; margin: 16px 0 0 0;">
                  Best regards,<br>
                  <strong style="color: #2d3748;">Dr. Iron Fitness Team</strong>
                </p>
              </div>
            </div>
            
            <div style="text-align: center; margin-top: 16px;">
              <p style="color: #a0aec0; font-size: 12px; margin: 0;">
                This email was sent because your coach approved your application at Dr. Iron Fitness
              </p>
            </div>
          </div>
        `,
      }),
    });

    let emailStatus = 'sent';
    let emailId = null;

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('Error sending email:', errorText);
      emailStatus = 'failed';
    } else {
      const emailData = await emailResponse.json();
      emailId = emailData.id;
      console.log('Email sent successfully:', emailData);
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
          // coach_email deliberately omitted - PII should not be sent to external services
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

    // Return success but do NOT include coach email in response
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
