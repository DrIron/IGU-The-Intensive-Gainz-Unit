import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

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
    console.log(`Running approved payment reminders check at ${now.toISOString()}`);

    // Find subscriptions that are active (coach approved) but profile is pending_payment
    const { data: approvedClients, error: fetchError } = await supabase
      .from('subscriptions')
      .select(`
        id,
        user_id,
        start_date,
        coach_id,
        profiles!inner(
          id,
          email,
          first_name,
          last_name,
          full_name,
          status,
          payment_deadline
        ),
        services!inner(
          name,
          type
        ),
        coaches!subscriptions_coach_id_fkey(
          first_name,
          last_name
        )
      `)
      .eq('status', 'active')
      .eq('profiles.status', 'pending_payment')
      .not('profiles.payment_deadline', 'is', null);

    if (fetchError) {
      console.error('Error fetching approved clients:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${approvedClients?.length || 0} clients awaiting payment after coach approval`);

    const results = {
      reminders_sent: 0,
      expired_accounts: 0,
      errors: 0,
    };

    for (const client of approvedClients || []) {
      try {
        const profile = client.profiles as any;
        const service = client.services as any;
        const coach = client.coaches as any;

        if (!profile || Array.isArray(profile)) {
          console.log(`Skipping client ${client.id} - invalid profile data`);
          continue;
        }

        const paymentDeadline = new Date(profile.payment_deadline);
        const daysUntilDeadline = Math.ceil((paymentDeadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        
        console.log(`Client ${profile.email}: ${daysUntilDeadline} days until deadline`);

        // If deadline has passed, expire the account
        if (daysUntilDeadline < 0) {
          console.log(`Expiring account for ${profile.email} - payment deadline passed`);
          
          // Update profile status to expired (write to profiles_public)
          await supabase
            .from('profiles_public')
            .update({ status: 'expired' })
            .eq('id', profile.id);

          // Update subscription to cancelled
          await supabase
            .from('subscriptions')
            .update({ 
              status: 'cancelled',
              cancelled_at: now.toISOString()
            })
            .eq('id', client.id);

          results.expired_accounts++;
          continue;
        }

        // Send reminders at specific intervals
        // Day 5 (2 days after approval assuming 7-day deadline)
        // Day 3 (4 days after approval)
        // Day 1 (final reminder)
        const shouldSendReminder = daysUntilDeadline === 5 || 
                                   daysUntilDeadline === 3 || 
                                   daysUntilDeadline === 1;

        if (shouldSendReminder) {
          const clientName = profile.first_name || profile.full_name || profile.email.split('@')[0];
          const coachName = coach ? `${coach.first_name} ${coach.last_name}` : undefined;
          const serviceName = service?.name;

          console.log(`Sending ${daysUntilDeadline}-day reminder to ${profile.email}`);

          const { error: emailError } = await supabase.functions.invoke('send-payment-reminder', {
            body: {
              email: profile.email,
              name: clientName,
              daysRemaining: daysUntilDeadline,
              stage: 'approved_waiting_payment',
              coachName,
              serviceName,
            },
          });

          if (emailError) {
            console.error(`Failed to send reminder to ${profile.email}:`, emailError);
            results.errors++;
          } else {
            console.log(`Successfully sent reminder to ${profile.email}`);
            results.reminders_sent++;
          }
        }
      } catch (error) {
        console.error(`Error processing client ${client.id}:`, error);
        results.errors++;
      }
    }

    console.log('Approved payment reminders check completed:', results);

    return new Response(
      JSON.stringify({ 
        success: true,
        timestamp: now.toISOString(),
        ...results 
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('Error in check-approved-payment-reminders:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
