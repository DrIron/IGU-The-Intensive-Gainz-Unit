import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_BASE_URL, EMAIL_FROM } from '../_shared/config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Process billing reminders for manual renewal subscriptions.
 * 
 * Sends reminders at:
 * - 7 days before due
 * - 3 days before due
 * - 1 day before due (final reminder)
 * - 1 day past due (past due notice)
 * - 3 days past due (urgent warning)
 * - 7 days past due (final warning before lock)
 * 
 * Also handles:
 * - Setting subscriptions to past_due status when next_billing_date passes
 * - Setting subscriptions to inactive after grace period expires
 */

interface SubscriptionWithProfile {
  id: string;
  user_id: string;
  status: string;
  next_billing_date: string | null;
  past_due_since: string | null;
  grace_period_days: number;
  billing_amount_kwd: number | null;
  services: {
    name: string;
    price_kwd: number;
  };
  profiles: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    status: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const now = new Date();
    const results = {
      reminders_7_days: 0,
      reminders_3_days: 0,
      reminders_1_day: 0,
      past_due_1_day: 0,
      past_due_3_days: 0,
      past_due_7_days: 0,
      marked_past_due: 0,
      marked_inactive: 0,
      errors: 0,
    };

    // Fetch all active subscriptions with billing dates
    const { data: subscriptions, error: fetchError } = await supabase
      .from('subscriptions')
      .select(`
        id,
        user_id,
        status,
        next_billing_date,
        past_due_since,
        grace_period_days,
        billing_amount_kwd,
        services (name, price_kwd),
        profiles!inner (id, email, first_name, last_name, status)
      `)
      .in('status', ['active', 'past_due'])
      .not('next_billing_date', 'is', null);

    if (fetchError) {
      console.error('Error fetching subscriptions:', fetchError);
      throw fetchError;
    }

    console.log(`Processing ${subscriptions?.length || 0} subscriptions for billing reminders`);

    for (const sub of (subscriptions || [])) {
      try {
        // Handle Supabase join results (may be object or array)
        const profileData = Array.isArray(sub.profiles) ? sub.profiles[0] : sub.profiles;
        const serviceData = Array.isArray(sub.services) ? sub.services[0] : sub.services;
        
        if (!profileData?.email) continue;

        const nextBillingDate = new Date(sub.next_billing_date!);
        const daysUntilDue = Math.floor((nextBillingDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const gracePeriodDays = sub.grace_period_days || 7;
        const amount = sub.billing_amount_kwd ?? serviceData?.price_kwd ?? 0;
        const serviceName = serviceData?.name || 'Your Plan';
        const fullName = `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim() || 'there';

        // Check if subscription should be marked as past_due (Day 0 - billing due date passed)
        // CRITICAL: Profile status remains 'active' during grace period (soft lock)
        if (sub.status === 'active' && daysUntilDue < 0) {
          console.log(`Marking subscription ${sub.id} as past_due (Day 0 - grace period starts)`);
          
          // Update ONLY subscription status to past_due
          // Profile remains active for soft lock (allows viewing content)
          await supabase
            .from('subscriptions')
            .update({ 
              status: 'past_due',
              past_due_since: now.toISOString(),
            })
            .eq('id', sub.id);

          results.marked_past_due++;
          
          // Send past due notification (day 1)
          await sendPastDueEmail(
            resendApiKey!,
            profileData.email,
            fullName,
            serviceName,
            amount,
            1,
            gracePeriodDays
          );
          
          await logEmailNotification(supabase, profileData.id, 'billing_past_due_1', 'sent');
          results.past_due_1_day++;
          continue;
        }

        // Handle past_due subscriptions
        if (sub.status === 'past_due' && sub.past_due_since) {
          const pastDueSince = new Date(sub.past_due_since);
          const daysPastDue = Math.floor((now.getTime() - pastDueSince.getTime()) / (1000 * 60 * 60 * 24));

          // Check if grace period has expired (Day 8+ - hard lock)
          if (daysPastDue >= gracePeriodDays) {
            console.log(`Grace period expired for subscription ${sub.id}, marking BOTH subscription AND profile inactive (hard lock)`);
            
            // CRITICAL: Now set BOTH subscription AND profile to inactive (hard lock)
            await supabase
              .from('subscriptions')
              .update({ status: 'inactive' })
              .eq('id', sub.id);

            await supabase
              .from('profiles_public')
              .update({ status: 'inactive' })
              .eq('id', sub.user_id);

            // Send account locked email
            await sendAccountLockedEmail(
              resendApiKey!,
              profileData.email,
              fullName,
              serviceName
            );

            await logEmailNotification(supabase, profileData.id, 'billing_account_locked', 'sent');
            results.marked_inactive++;
            continue;
          }

          // Send past due reminders at specific intervals
          const reminderKey = `billing_past_due_${daysPastDue}`;
          const alreadySent = await checkRecentNotification(supabase, profileData.id, reminderKey, 20); // 20 hour cooldown

          if (!alreadySent) {
            if (daysPastDue === 3) {
              await sendPastDueEmail(resendApiKey!, profileData.email, fullName, serviceName, amount, 3, gracePeriodDays);
              await logEmailNotification(supabase, profileData.id, 'billing_past_due_3', 'sent');
              results.past_due_3_days++;
            } else if (daysPastDue === gracePeriodDays - 1) {
              // Final warning (1 day before lock)
              await sendFinalWarningEmail(resendApiKey!, profileData.email, fullName, serviceName, amount);
              await logEmailNotification(supabase, profileData.id, 'billing_final_warning', 'sent');
              results.past_due_7_days++;
            }
          }
          continue;
        }

        // Handle upcoming payment reminders for active subscriptions
        if (sub.status === 'active') {
          let reminderType: string | null = null;
          let resultKey: keyof typeof results | null = null;

          if (daysUntilDue === 7) {
            reminderType = 'billing_reminder_7';
            resultKey = 'reminders_7_days';
          } else if (daysUntilDue === 3) {
            reminderType = 'billing_reminder_3';
            resultKey = 'reminders_3_days';
          } else if (daysUntilDue === 1) {
            reminderType = 'billing_reminder_1';
            resultKey = 'reminders_1_day';
          }

          if (reminderType && resultKey) {
            const alreadySent = await checkRecentNotification(supabase, profileData.id, reminderType, 20);

            if (!alreadySent) {
              await sendUpcomingPaymentEmail(
                resendApiKey!,
                profileData.email,
                fullName,
                serviceName,
                amount,
                nextBillingDate,
                daysUntilDue
              );

              await logEmailNotification(supabase, profileData.id, reminderType, 'sent');
              results[resultKey]++;
              console.log(`Sent ${reminderType} to ${profileData.email}`);
            }
          }
        }
      } catch (subError) {
        console.error(`Error processing subscription ${sub.id}:`, subError);
        results.errors++;
      }
    }

    console.log('Billing reminders completed:', results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in process-billing-reminders:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process billing reminders', message: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper: Check if notification was sent recently
async function checkRecentNotification(
  supabase: any,
  userId: string,
  notificationType: string,
  hoursAgo: number
): Promise<boolean> {
  const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  
  const { data } = await supabase
    .from('email_notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('notification_type', notificationType)
    .gte('sent_at', cutoff)
    .limit(1);

  return (data?.length || 0) > 0;
}

// Helper: Log email notification
async function logEmailNotification(
  supabase: any,
  userId: string,
  notificationType: string,
  status: 'sent' | 'failed'
): Promise<void> {
  try {
    await supabase.from('email_notifications').insert({
      user_id: userId,
      notification_type: notificationType,
      status,
      sent_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to log email notification:', error);
  }
}

// Email: Upcoming payment reminder
async function sendUpcomingPaymentEmail(
  apiKey: string,
  email: string,
  name: string,
  serviceName: string,
  amount: number,
  dueDate: Date,
  daysUntilDue: number
): Promise<void> {
  const payUrl = `${APP_BASE_URL}/billing/pay`;
  const isUrgent = daysUntilDue <= 1;
  const dueDateStr = dueDate.toLocaleDateString('en-US', { 
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
  });

  const subject = isUrgent
    ? `⏰ Final Reminder: Payment Due Tomorrow – ${serviceName}`
    : `Payment Reminder: ${serviceName} due in ${daysUntilDue} days`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #2d3748; font-size: 26px; margin: 0 0 8px 0;">
            ${isUrgent ? '⏰ Payment Due Tomorrow!' : '📅 Upcoming Payment'}
          </h1>
        </div>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Hi ${name},
        </p>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          ${isUrgent 
            ? `This is a reminder that your payment for <strong>${serviceName}</strong> is due tomorrow.`
            : `Your next payment for <strong>${serviceName}</strong> is coming up in ${daysUntilDue} days.`
          }
        </p>
        
        <div style="background: ${isUrgent ? '#FEF3CD' : '#E8F4FD'}; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="color: ${isUrgent ? '#856404' : '#1E40AF'}; font-size: 16px; margin: 0 0 8px 0;">
            <strong>Payment Details</strong>
          </p>
          <p style="color: #4a5568; font-size: 14px; margin: 4px 0;">Plan: ${serviceName}</p>
          <p style="color: #4a5568; font-size: 14px; margin: 4px 0;">Amount: <strong>${amount} KWD</strong></p>
          <p style="color: #4a5568; font-size: 14px; margin: 4px 0;">Due Date: ${dueDateStr}</p>
        </div>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${payUrl}" 
             style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(76, 175, 80, 0.3);">
            Pay Now →
          </a>
        </div>
        
        <p style="color: #718096; font-size: 14px; text-align: center;">
          Pay early to ensure uninterrupted access to your coaching services.
        </p>
        
        <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 32px;">
          <p style="color: #4a5568; font-size: 16px; margin: 0;">
            Best regards,<br>
            <strong style="color: #2d3748;">Dr. Iron Team</strong>
          </p>
        </div>
      </div>
    </div>
  `;

  await sendEmail(apiKey, email, subject, html);
}

// Email: Past due notice
async function sendPastDueEmail(
  apiKey: string,
  email: string,
  name: string,
  serviceName: string,
  amount: number,
  daysPastDue: number,
  gracePeriodDays: number
): Promise<void> {
  const payUrl = `${APP_BASE_URL}/billing/pay`;
  const daysRemaining = gracePeriodDays - daysPastDue;

  const subject = daysPastDue === 1
    ? `⚠️ Payment Past Due – ${serviceName}`
    : `🚨 Urgent: Payment ${daysPastDue} Days Overdue – Action Required`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #DC2626; font-size: 26px; margin: 0 0 8px 0;">
            ⚠️ Payment Past Due
          </h1>
        </div>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Hi ${name},
        </p>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Your payment for <strong>${serviceName}</strong> is now <strong>${daysPastDue} ${daysPastDue === 1 ? 'day' : 'days'}</strong> past due.
        </p>
        
        <div style="background: #FEE2E2; border-left: 4px solid #DC2626; border-radius: 4px; padding: 20px; margin: 24px 0;">
          <p style="color: #991B1B; font-size: 16px; font-weight: bold; margin: 0 0 8px 0;">
            ${daysRemaining} days remaining to avoid service interruption
          </p>
          <p style="color: #991B1B; font-size: 14px; margin: 0;">
            Amount due: <strong>${amount} KWD</strong>
          </p>
        </div>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          To continue enjoying uninterrupted access to your coaching services, please complete your payment as soon as possible.
        </p>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${payUrl}" 
             style="display: inline-block; background-color: #DC2626; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);">
            Pay ${amount} KWD Now →
          </a>
        </div>
        
        <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 32px;">
          <p style="color: #4a5568; font-size: 16px; margin: 0;">
            Best regards,<br>
            <strong style="color: #2d3748;">Dr. Iron Team</strong>
          </p>
        </div>
      </div>
    </div>
  `;

  await sendEmail(apiKey, email, subject, html);
}

// Email: Final warning before lock
async function sendFinalWarningEmail(
  apiKey: string,
  email: string,
  name: string,
  serviceName: string,
  amount: number
): Promise<void> {
  const payUrl = `${APP_BASE_URL}/billing/pay`;

  const subject = `🚨 FINAL WARNING: Your ${serviceName} access will be suspended tomorrow`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-top: 4px solid #DC2626;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #DC2626; font-size: 26px; margin: 0 0 8px 0;">
            🚨 FINAL WARNING
          </h1>
          <p style="color: #DC2626; font-size: 18px; margin: 0;">
            Your access will be suspended tomorrow
          </p>
        </div>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Hi ${name},
        </p>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          This is your <strong>final warning</strong>. Your payment for <strong>${serviceName}</strong> is significantly overdue, and your access will be <strong>suspended tomorrow</strong> unless payment is received.
        </p>
        
        <div style="background: #7F1D1D; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
          <p style="color: white; font-size: 20px; font-weight: bold; margin: 0 0 8px 0;">
            PAY NOW TO AVOID SUSPENSION
          </p>
          <p style="color: rgba(255,255,255,0.9); font-size: 16px; margin: 0;">
            Amount due: ${amount} KWD
          </p>
        </div>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Once suspended, you will lose access to:
        </p>
        <ul style="color: #4a5568; font-size: 14px; line-height: 1.8;">
          <li>Your personalized nutrition plans</li>
          <li>Workout library access</li>
          <li>Coach messaging</li>
          <li>All premium features</li>
        </ul>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${payUrl}" 
             style="display: inline-block; background-color: #DC2626; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 18px; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);">
            Pay ${amount} KWD Now →
          </a>
        </div>
        
        <p style="color: #718096; font-size: 14px; text-align: center;">
          Questions? Reply to this email or contact support@theigu.com
        </p>
        
        <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 32px;">
          <p style="color: #4a5568; font-size: 16px; margin: 0;">
            Best regards,<br>
            <strong style="color: #2d3748;">Dr. Iron Team</strong>
          </p>
        </div>
      </div>
    </div>
  `;

  await sendEmail(apiKey, email, subject, html);
}

// Email: Account locked
async function sendAccountLockedEmail(
  apiKey: string,
  email: string,
  name: string,
  serviceName: string
): Promise<void> {
  const payUrl = `${APP_BASE_URL}/billing/pay`;

  const subject = `Your ${serviceName} subscription has been suspended`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; border-radius: 12px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #4a5568; font-size: 26px; margin: 0 0 8px 0;">
            Subscription Suspended
          </h1>
        </div>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Hi ${name},
        </p>
        
        <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">
          Your <strong>${serviceName}</strong> subscription has been suspended due to non-payment. Your access to coaching features has been temporarily disabled.
        </p>
        
        <div style="background: #F3F4F6; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="color: #4a5568; font-size: 16px; margin: 0 0 8px 0;">
            <strong>Want to reactivate?</strong>
          </p>
          <p style="color: #6B7280; font-size: 14px; margin: 0;">
            You can restore your access at any time by completing your payment. All your data and progress will be preserved.
          </p>
        </div>
        
        <div style="text-align: center; margin: 32px 0;">
          <a href="${payUrl}" 
             style="display: inline-block; background-color: #4CAF50; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            Reactivate My Account →
          </a>
        </div>
        
        <p style="color: #718096; font-size: 14px; text-align: center;">
          Questions? Contact us at support@theigu.com
        </p>
        
        <div style="border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 32px;">
          <p style="color: #4a5568; font-size: 16px; margin: 0;">
            Best regards,<br>
            <strong style="color: #2d3748;">Dr. Iron Team</strong>
          </p>
        </div>
      </div>
    </div>
  `;

  await sendEmail(apiKey, email, subject, html);
}

// Helper: Send email via Resend
async function sendEmail(apiKey: string, to: string, subject: string, html: string): Promise<void> {
  if (!apiKey) {
    console.log(`[DRY RUN] Would send email to ${to}: ${subject}`);
    return;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to send email to ${to}:`, errorText);
      throw new Error(`Email send failed: ${errorText}`);
    }

    console.log(`Email sent successfully to ${to}: ${subject}`);
  } catch (error) {
    console.error('Error sending email:', error);
    // Don't throw - emails are non-blocking per project rules
  }
}
