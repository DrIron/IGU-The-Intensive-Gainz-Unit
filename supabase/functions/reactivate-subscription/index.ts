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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

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

    // Get user's cancelled/inactive subscription
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('*, services(id, name, price_kwd), profiles!inner(email, first_name, last_name)')
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

    const tapSecretKey = Deno.env.get('TAP_SECRET_KEY');
    if (!tapSecretKey) {
      console.error('TAP_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Payment system configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profile = Array.isArray(subscription.profiles) ? subscription.profiles[0] : subscription.profiles;
    const customerName = `${profile?.first_name || 'Customer'} ${profile?.last_name || ''}`.trim();
    
    // Create a one-time TAP charge for reactivation (NO card saving)
    const chargeResponse = await fetch('https://api.tap.company/v2/charges', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tapSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: subscription.services.price_kwd,
        currency: 'KWD',
        customer: {
          first_name: profile?.first_name || 'Customer',
          last_name: profile?.last_name || '',
          email: profile?.email || '',
        },
        description: `${subscription.services.name} - Reactivation`,
        metadata: {
          service_id: subscription.service_id,
          user_id: userId,
          email: profile?.email || '',
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
    await supabase
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

    // Clear cancellation from form submission
    await supabase
      .from('form_submissions')
      .update({
        cancelled_at: null,
        cancellation_reason: null,
      })
      .eq('user_id', userId);

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
