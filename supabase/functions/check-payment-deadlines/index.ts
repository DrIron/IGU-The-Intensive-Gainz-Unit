import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_BASE_URL, AUTH_REDIRECT_URLS, EMAIL_FROM } from '../_shared/config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const now = new Date();
    const results = {
      pending_payment_reminders: 0,
      expired_subscriptions: 0,
      failed_payment_restricted: 0,
      failed_payment_cancelled: 0,
      failed_payment_reminders: 0,
    };

    // FLOW 6 & 7: Handle pending_payment status with payment deadlines
    const { data: pendingPaymentProfiles, error: pendingError } = await supabase
      .from('profiles')
      .select(`
        id,
        email,
        first_name,
        last_name,
        status,
        payment_deadline,
        subscriptions!inner(
          id,
          status,
          service_id,
          services(name, price_kwd)
        )
      `)
      .eq('status', 'pending_payment')
      .not('payment_deadline', 'is', null);

    if (pendingError) {
      console.error('Error fetching pending payment profiles:', pendingError);
    }

    for (const profile of pendingPaymentProfiles || []) {
      if (!profile.payment_deadline) continue;
      
      const deadline = new Date(profile.payment_deadline);
      const hoursUntilDeadline = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
      const subscription = (profile.subscriptions as any)?.[0];
      const serviceName = subscription?.services?.name || 'your program';
      const servicePrice = subscription?.services?.price_kwd || 0;
      const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

      // FLOW 7: Deadline has passed - set to inactive and send email
      if (hoursUntilDeadline < 0) {
        await supabase
          .from('profiles_public')
          .update({ status: 'inactive', payment_deadline: null })
          .eq('id', profile.id);

        await supabase
          .from('subscriptions')
          .update({ status: 'inactive' })
          .eq('user_id', profile.id)
          .eq('status', 'pending');

        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (resendApiKey && profile.email) {
          try {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: EMAIL_FROM,
                to: [profile.email],
                subject: '[IGU] Your subscription request has expired',
                html: `
                  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Subscription Request Expired</h1>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                      Hi ${fullName || 'there'},
                    </p>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                      Your payment deadline for <strong>${serviceName}</strong> has passed, and we haven't received your payment. Your spot has been released to allow others to join.
                    </p>
                    
                    <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 30px 0; border-radius: 4px;">
                      <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.6;">
                        <strong>Want to join?</strong><br>
                        If you still want to be part of IGU Coaching, you can restart your application at any time.
                      </p>
                    </div>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                      Simply visit <a href="${AUTH_REDIRECT_URLS.services}" style="color: #667eea;">${AUTH_REDIRECT_URLS.services}</a> to get started again. We'd love to have you!
                    </p>
                    
                    <p style="color: #666; font-size: 16px; line-height: 1.5;">
                      Best regards,<br>
                      <strong>The IGU Team</strong>
                    </p>
                  </div>
                `,
              }),
            });
            await supabase.from('email_notifications').insert({
              user_id: profile.id,
              notification_type: 'subscription_inactive',
              status: 'sent',
              sent_at: new Date().toISOString()
            });
          } catch (emailError) {
            console.error('Error sending deadline expired email:', emailError);
            await supabase.from('email_notifications').insert({
              user_id: profile.id,
              notification_type: 'subscription_inactive',
              status: 'failed',
              sent_at: new Date().toISOString()
            });
          }
        }
        results.expired_subscriptions++;
        console.log(`Expired pending payment for user ${profile.id}`);
      }
      // FLOW 6: Send reminder 24-48 hours before deadline
      else if (hoursUntilDeadline > 24 && hoursUntilDeadline < 48) {
        // Check if we already sent a reminder recently
        const { data: recentReminder } = await supabase
          .from('email_notifications')
          .select('sent_at')
          .eq('user_id', profile.id)
          .eq('notification_type', 'payment_reminder')
          .gte('sent_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
          .maybeSingle();

        if (!recentReminder) {
          const resendApiKey = Deno.env.get('RESEND_API_KEY');
          if (resendApiKey && profile.email) {
            try {
              const daysUntilDeadline = Math.ceil(hoursUntilDeadline / 24);
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${resendApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: EMAIL_FROM,
                  to: [profile.email],
                  subject: '[IGU] Reminder – complete your payment to secure your spot',
                  html: `
                    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                      <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">⏰ Payment Reminder</h1>
                      
                      <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                        Hi ${fullName || 'there'},
                      </p>
                      
                      <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                        This is a friendly reminder that your payment for <strong>${serviceName}</strong> is due soon.
                      </p>
                      
                      <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 30px 0; border-radius: 4px;">
                        <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.6;">
                          <strong>Payment Details:</strong><br>
                          • Service: ${serviceName}<br>
                          • Amount: ${servicePrice} KWD/month<br>
                          • Deadline: ${deadline.toLocaleDateString()} at ${deadline.toLocaleTimeString()}<br>
                          • Time remaining: ~${daysUntilDeadline} day${daysUntilDeadline !== 1 ? 's' : ''}
                        </p>
                      </div>
                      
                      <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                        Please complete your payment soon to secure your spot. After the deadline, your reservation will be released.
                      </p>
                      
                      <div style="text-align: center; margin: 30px 0;">
                        <a href="${AUTH_REDIRECT_URLS.dashboard}" 
                           style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                          Complete Payment Now
                        </a>
                      </div>
                      
                      <p style="color: #666; font-size: 16px; line-height: 1.5;">
                        Best regards,<br>
                        <strong>The IGU Team</strong>
                      </p>
                    </div>
                  `,
                }),
              });
              await supabase.from('email_notifications').insert({
                user_id: profile.id,
                notification_type: 'payment_reminder',
                status: 'sent',
                sent_at: new Date().toISOString()
              });
              results.pending_payment_reminders++;
            } catch (emailError) {
              console.error('Error sending payment reminder:', emailError);
              await supabase.from('email_notifications').insert({
                user_id: profile.id,
                notification_type: 'payment_reminder',
                status: 'failed',
                sent_at: new Date().toISOString()
              });
            }
          }
        }
      }
    }

    // Handle failed payments (existing logic)
    const { data: failedSubscriptions, error: fetchError } = await supabase
      .from('subscriptions')
      .select('id, user_id, payment_failed_at, tap_subscription_id, profiles(id, email, first_name, last_name, status)')
      .eq('status', 'failed')
      .not('payment_failed_at', 'is', null);

    if (fetchError) throw fetchError;

    for (const subscription of failedSubscriptions || []) {
      const failedAt = new Date(subscription.payment_failed_at);
      const daysSinceFailure = Math.floor((now.getTime() - failedAt.getTime()) / (24 * 60 * 60 * 1000));
      const profileData = subscription.profiles as any;

      if (!profileData || Array.isArray(profileData)) continue;
      
      const profile = profileData as { id: string; email: string; first_name: string | null; last_name: string | null; status: string };

      // After 14 days: Cancel TAP subscription and hard delete account
      if (daysSinceFailure >= 14) {
        if (subscription.tap_subscription_id) {
          const tapSecretKey = Deno.env.get('TAP_SECRET_KEY');
          
          try {
            await fetch(
              `https://api.tap.company/v2/subscriptions/${subscription.tap_subscription_id}`,
              {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${tapSecretKey}`,
                },
              }
            );
            console.log('TAP subscription cancelled for failed payment:', subscription.tap_subscription_id);
          } catch (error) {
            console.error('Failed to cancel TAP subscription:', error);
          }
        }

        await supabase.functions.invoke('delete-account', {
          body: { userId: subscription.user_id }
        });

        console.log(`Hard deleted account for user ${subscription.user_id} after 14 days of payment failure`);
        results.failed_payment_cancelled++;
      }
      // After 7 days: Set to inactive status and update subscription
      else if (daysSinceFailure >= 7 && profile.status === 'active') {
        await supabase
          .from('profiles_public')
          .update({ status: 'inactive' })
          .eq('id', subscription.user_id);

        await supabase
          .from('subscriptions')
          .update({ status: 'inactive' })
          .eq('id', subscription.id);

        console.log(`Set account to inactive for user ${subscription.user_id} after 7 days`);
        results.failed_payment_restricted++;
      }
      // Days 0-7: Keep active, send reminders at day 3 and day 5
      else if (profile.status === 'active') {
        const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
        
        if (daysSinceFailure === 3 || daysSinceFailure === 5) {
          await supabase.functions.invoke('send-payment-reminder', {
            body: {
              email: profile.email,
              name: fullName || 'there',
              daysRemaining: 7 - daysSinceFailure,
              stage: 'active_grace',
            },
          });
          results.failed_payment_reminders++;
        }
      }
      // Days 8-14: Inactive, send reminders at day 10 and day 12
      else if (profile.status === 'inactive') {
        const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
        
        if (daysSinceFailure === 10 || daysSinceFailure === 12) {
          await supabase.functions.invoke('send-payment-reminder', {
            body: {
              email: profile.email,
              name: fullName || 'there',
              daysRemaining: 14 - daysSinceFailure,
              stage: 'inactive',
            },
          });
          results.failed_payment_reminders++;
        }
      }
    }

    console.log('Payment deadline check completed:', results);

    return new Response(
      JSON.stringify(results),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error checking payment deadlines:', error);
    return new Response(
      JSON.stringify({ error: 'Payment deadline check failed' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
