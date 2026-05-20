import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AUTH_REDIRECT_URLS } from "../_shared/config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Reactivate a cancelled or expired subscription by initiating a new manual payment.
 *
 * In the manual billing model:
 * - User clicks "Reactivate" in their dashboard
 * - This function creates a new TAP charge (one-time payment)
 * - User is redirected to TAP hosted checkout
 * - Upon successful payment, subscription is reactivated via webhook
 *
 * NO card tokens or payment agreements are stored.
 */
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
    const { userId } = requestBody;

    // Validate required fields
    if (!userId) {
      console.error('Missing userId in reactivation request');
      return new Response(
        JSON.stringify({ error: 'Missing required information' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization: user can only reactivate their own subscription, unless they're an admin
    if (caller.id !== userId) {
      const { data: callerRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', caller.id);
      const isAdmin = callerRoles?.some(r => r.role === 'admin');
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: 'You can only reactivate your own subscription' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Payment-exempt enforcement: re-check server-side so a direct POST can't bill an exempt user.
    const { data: exemptProfile, error: exemptError } = await supabase
      .from('profiles_public')
      .select('payment_exempt')
      .eq('id', userId)
      .maybeSingle();
    if (exemptError) {
      console.error('Payment-exempt check failed:', exemptError);
      throw exemptError;
    }
    if (exemptProfile?.payment_exempt) {
      console.warn(`Reactivation blocked: user ${userId} is payment_exempt`);
      return new Response(
        JSON.stringify({ error: 'payment_exempt' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotency dedupe: block double-click / double-tap races where two charges land before
    // either completes. Look for an "initiated" charge for this user within the last 30s.
    const dedupeCutoff = new Date(Date.now() - 30_000).toISOString();
    const { data: recentAttempt } = await supabase
      .from('subscription_payments')
      .select('id, tap_charge_id, created_at')
      .eq('user_id', userId)
      .eq('status', 'initiated')
      .gte('created_at', dedupeCutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentAttempt) {
      console.warn(`Reactivation dedupe block: user ${userId}, existing charge ${recentAttempt.tap_charge_id}`);
      return new Response(
        JSON.stringify({ error: 'A payment request is already in progress. Please wait a moment and try again.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's cancelled/inactive subscription (no joins — profiles is a view, FK is unreliable)
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['cancelled', 'inactive'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError || !subscription) {
      console.error('No cancelled/inactive subscription found for user:', userId);
      return new Response(
        JSON.stringify({ error: 'No subscription found to reactivate' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Service details (separate query)
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('id, name, price_kwd')
      .eq('id', subscription.service_id)
      .maybeSingle();
    if (serviceError || !service) {
      console.error('Service lookup failed:', serviceError);
      return new Response(
        JSON.stringify({ error: 'Service not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Profile name + email come from split tables (profiles_public + profiles_private)
    const [publicResult, privateResult] = await Promise.all([
      supabase
        .from('profiles_public')
        .select('first_name')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('profiles_private')
        .select('email, last_name')
        .eq('profile_id', userId)
        .maybeSingle(),
    ]);

    if (publicResult.error) {
      console.error('profiles_public lookup failed:', publicResult.error);
      throw publicResult.error;
    }
    if (privateResult.error) {
      console.error('profiles_private lookup failed:', privateResult.error);
      throw privateResult.error;
    }

    const firstName = publicResult.data?.first_name || 'Customer';
    const lastName = privateResult.data?.last_name || '';
    const customerEmail = privateResult.data?.email || '';

    const tapSecretKey = Deno.env.get('TAP_SECRET_KEY');
    if (!tapSecretKey) {
      console.error('TAP_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Payment system configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a one-time TAP charge for reactivation (NO card saving)
    const chargeResponse = await fetch('https://api.tap.company/v2/charges', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tapSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: service.price_kwd,
        currency: 'KWD',
        customer: {
          first_name: firstName,
          last_name: lastName,
          email: customerEmail,
        },
        description: `${service.name} - Reactivation`,
        metadata: {
          service_id: subscription.service_id,
          user_id: userId,
          email: customerEmail,
          is_renewal: 'true',
          billing_type: 'manual',
        },
        receipt: {
          email: true,
          sms: false,
        },
        save_card: false, // CRITICAL: Never save cards
        source: {
          id: 'src_all',
        },
        redirect: {
          url: AUTH_REDIRECT_URLS.paymentReturn,
        },
        post: {
          url: `${supabaseUrl}/functions/v1/tap-webhook`,
        },
      }),
    });

    if (!chargeResponse.ok) {
      const errorText = await chargeResponse.text();
      console.error('TAP charge creation failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to create payment. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tapCharge = await chargeResponse.json();
    console.log('TAP reactivation charge created:', tapCharge.id);

    const paymentUrl = tapCharge.transaction?.url || tapCharge.redirect_url || null;

    if (!paymentUrl) {
      return new Response(
        JSON.stringify({ error: 'Payment URL was not provided' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update subscription with new charge ID (pending payment)
    // Clear any legacy card/agreement fields
    const { error: updateSubError } = await supabase
      .from('subscriptions')
      .update({
        tap_charge_id: tapCharge.id,
        tap_subscription_status: tapCharge.status,
        tap_card_id: null,
        tap_payment_agreement_id: null,
        cancel_at_period_end: false,
        cancelled_at: null,
      })
      .eq('id', subscription.id);
    if (updateSubError) throw updateSubError;

    // Clear cancellation from form submission
    const { error: updateFormError } = await supabase
      .from('form_submissions')
      .update({
        cancelled_at: null,
        cancellation_reason: null,
      })
      .eq('user_id', userId);
    if (updateFormError) throw updateFormError;

    console.log(`Reactivation payment initiated for user ${userId}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Please complete payment to reactivate your subscription',
        redirect_url: paymentUrl,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error reactivating subscription:', error);

    return new Response(
      JSON.stringify({ error: 'Subscription reactivation failed' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
