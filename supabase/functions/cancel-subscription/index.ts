import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Internal auth: verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify JWT resolves to a real user
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const requestBody = await req.json();
    const { userId, reason, cancelledBy } = requestBody;

    // Validate required fields
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required information' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization: user can only cancel their own subscription, unless they're an admin
    if (caller.id !== userId) {
      const { data: callerRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', caller.id);
      const isAdmin = callerRoles?.some(r => r.role === 'admin');
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: 'You can only cancel your own subscription' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get user's subscription and service info (active or pending)
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, services(discord_role_id)')
      .eq('user_id', userId)
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError || !subscription) {
      console.error('No active or pending subscription found for user:', userId);
      return new Response(
        JSON.stringify({ error: 'No active or pending subscription found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cancel subscription in TAP IMMEDIATELY (stop all future payments)
    if (subscription.tap_subscription_id) {
      const tapSecretKey = Deno.env.get('TAP_SECRET_KEY');
      
      // DELETE the subscription to stop all future charges immediately
      const tapResponse = await fetch(
        `https://api.tap.company/v2/subscriptions/${subscription.tap_subscription_id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${tapSecretKey}`,
          },
        }
      );

      if (!tapResponse.ok) {
        const errorText = await tapResponse.text();
        console.error('TAP subscription deletion failed:', errorText);
        // Continue anyway - we'll mark as cancelled in our DB
      } else {
        console.log('TAP subscription cancelled immediately:', subscription.tap_subscription_id);
      }
    }

    // For pending subscriptions, cancel immediately. For active, cancel at period end.
    const isPending = subscription.status === 'pending';
    const periodEnd = isPending
      ? new Date().toISOString()
      : (subscription.next_billing_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

    await supabase
      .from('subscriptions')
      .update({
        status: isPending ? 'cancelled' : subscription.status,
        cancel_at_period_end: !isPending,
        cancelled_at: new Date().toISOString(),
        end_date: periodEnd,
      })
      .eq('id', subscription.id);

    // Update profile status for pending cancellations
    if (isPending) {
      await supabase
        .from('profiles_public')
        .update({ status: 'cancelled' })
        .eq('id', userId);
    }

    console.log(`Subscription ${isPending ? 'cancelled immediately' : 'will be deleted at period end'}: ${periodEnd}`);

    // Update form submission with who cancelled
    await supabase
      .from('form_submissions')
      .update({
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason || (cancelledBy === 'admin' ? 'Admin cancelled subscription' : 'User requested cancellation'),
      })
      .eq('user_id', userId);

    console.log(`Subscription cancelled for user ${userId}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error cancelling subscription:', error);
    
    // Return generic error to client, log details server-side only
    return new Response(
      JSON.stringify({ error: 'Subscription cancellation failed' }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
