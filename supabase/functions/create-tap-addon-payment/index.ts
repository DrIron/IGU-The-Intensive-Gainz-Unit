import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { AUTH_REDIRECT_URLS } from "../_shared/config.ts";
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

/**
 * CREATE TAP ADDON PAYMENT
 *
 * Mirrors create-tap-payment but for the addon-services Path B flow.
 * Differences:
 *   - Writes to addon_payments (not subscription_payments)
 *   - Validates tier_restrictions against caller's active subscription
 *     server-side (matches purchase_addon_atomic's check; rejecting here
 *     avoids taking payment for an addon that would later fail to
 *     materialise)
 *   - Tap charge's post.url points at tap-webhook-addon (the dedicated
 *     addon webhook -- zero risk to subscription path)
 *   - metadata.billing_type = 'addon' (defense-in-depth -- if Tap ever
 *     misroutes, the addon webhook can reject non-addon metadata)
 *
 * Returns: { success, paymentUrl, chargeId, addonPaymentId }
 *
 * Deploy: supabase functions deploy create-tap-addon-payment --no-verify-jwt
 * Reason: gateway rejects ES256 JWTs; internal auth check via userClient.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tapSecretKey = Deno.env.get('TAP_SECRET_KEY');
    if (!tapSecretKey) {
      console.error(JSON.stringify({ fn: "create-tap-addon-payment", step: "config", ok: false, error: "tap_key_missing" }));
      return new Response(
        JSON.stringify({ success: false, error: 'Payment system configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit: 10/min/user (matches create-tap-payment)
    const rateCheck = checkRateLimit(`addon:${user.id}`, 10, 60_000);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
    }

    const schema = z.object({
      addonServiceId:  z.string().uuid(),
      userId:          z.string().uuid(),
      customerEmail:   z.string().email().max(255),
      customerName:    z.string().trim().min(1).max(100)
                         .regex(/^[a-zA-Z\s'-]+$/, 'Name contains invalid characters'),
      quantity:        z.number().int().min(1).max(10).default(1),
    });

    let payload;
    try {
      payload = schema.parse(await req.json());
    } catch {
      console.error(JSON.stringify({ fn: "create-tap-addon-payment", step: "validation", ok: false }));
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid request payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { addonServiceId, userId, customerEmail, customerName, quantity } = payload;

    if (user.id !== userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'User mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Dedupe: any initiated addon_payment for the same (user, addon_service) within 30s
    const dedupeCutoff = new Date(Date.now() - 30_000).toISOString();
    const { data: recent } = await supabase
      .from('addon_payments')
      .select('id, tap_charge_id, created_at, metadata')
      .eq('client_id', userId)
      .eq('status', 'initiated')
      .gte('created_at', dedupeCutoff)
      .order('created_at', { ascending: false })
      .limit(5);
    const dupe = (recent ?? []).find((r: any) => r?.metadata?.addon_service_id === addonServiceId);
    if (dupe) {
      console.warn(JSON.stringify({ fn: "create-tap-addon-payment", step: "dedupe_block", ok: false, user_id: userId, existing: dupe.tap_charge_id }));
      return new Response(
        JSON.stringify({ success: false, error: 'A purchase request is already in progress. Please wait a moment and try again.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Load addon service
    const { data: service, error: svcError } = await supabase
      .from('addon_services')
      .select('id, name, type, base_price_kwd, pack_size, pack_price_kwd, pack_expiry_months, tier_restrictions, is_active')
      .eq('id', addonServiceId)
      .maybeSingle();
    if (svcError) throw svcError;
    if (!service) {
      return new Response(
        JSON.stringify({ success: false, error: 'Addon not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (!service.is_active) {
      return new Response(
        JSON.stringify({ success: false, error: 'This addon is not currently available' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Server-side tier_restrictions (matches purchase_addon_atomic exactly)
    if (service.tier_restrictions && service.tier_restrictions.length > 0) {
      const { data: subRow } = await supabase
        .from('subscriptions')
        .select('service_id')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      let subSlug: string | null = null;
      if (subRow?.service_id) {
        const { data: srv } = await supabase
          .from('services')
          .select('slug')
          .eq('id', subRow.service_id)
          .maybeSingle();
        subSlug = srv?.slug ?? null;
      }
      if (!subSlug || !service.tier_restrictions.includes(subSlug)) {
        console.warn(JSON.stringify({ fn: "create-tap-addon-payment", step: "tier_block", ok: false, user_id: userId, addon: service.name }));
        return new Response(
          JSON.stringify({
            success: false,
            error: `This addon requires an active subscription on: ${service.tier_restrictions.join(', ')}`,
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Price computation (Tap-style 2-decimal rounding; mirrors RPC exactly)
    const unitPrice = (service.pack_size && service.pack_price_kwd)
      ? Number(service.pack_price_kwd)
      : Number(service.base_price_kwd);
    const totalKwd = Math.round(unitPrice * quantity * 100) / 100;

    // Pre-insert addon_payments row with status='initiated'
    const { data: paymentRow, error: paymentInsertError } = await supabase
      .from('addon_payments')
      .insert({
        client_id: userId,
        amount_kwd: totalKwd,
        status: 'initiated',
        metadata: {
          addon_service_id: addonServiceId,
          addon_service_name: service.name,
          quantity,
          pre_charge: true,
        },
      })
      .select('id')
      .single();
    if (paymentInsertError) {
      console.error(JSON.stringify({ fn: "create-tap-addon-payment", step: "payment_insert", ok: false, error: paymentInsertError.code }));
      throw paymentInsertError;
    }
    const addonPaymentId = paymentRow.id;

    // Tap charge
    const timestamp = Date.now();
    const orderRef = `igu_addon_${userId.slice(0, 8)}_${timestamp}`;
    const txnRef = `txn_addon_${timestamp}`;

    const chargeBody = {
      amount: totalKwd,
      currency: 'KWD',
      threeDSecure: true,
      customer_initiated: true,
      customer: {
        first_name: customerName.split(' ')[0] || customerName,
        last_name: customerName.split(' ').slice(1).join(' ') || '',
        email: customerEmail,
      },
      description: `${service.name}${quantity > 1 ? ` x${quantity}` : ''} -- IGU Addon`,
      reference: {
        transaction: txnRef,
        order: orderRef,
        idempotent: orderRef,
      },
      metadata: {
        billing_type: 'addon',
        addon_payment_id: addonPaymentId,
        addon_service_id: addonServiceId,
        client_id: userId,
        quantity: String(quantity),
        amount_kwd: String(totalKwd),
      },
      receipt: { email: true, sms: false },
      save_card: false,
      source: { id: 'src_all' },
      redirect: { url: AUTH_REDIRECT_URLS.paymentReturn },
      post: { url: `${supabaseUrl}/functions/v1/tap-webhook-addon` },
    };

    const chargeResponse = await fetch('https://api.tap.company/v2/charges', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tapSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chargeBody),
    });

    if (!chargeResponse.ok) {
      await chargeResponse.text();
      console.error(JSON.stringify({ fn: "create-tap-addon-payment", step: "tap_charge", ok: false, status: chargeResponse.status }));
      // Mark the addon_payments row as failed so it's not picked up by future retries
      await supabase
        .from('addon_payments')
        .update({ status: 'failed', failed_at: new Date().toISOString(), failure_reason: 'tap_charge_creation_failed' })
        .eq('id', addonPaymentId);
      throw new Error('Failed to create payment. Please try again.');
    }

    const tapCharge = await chargeResponse.json();
    const paymentUrl = tapCharge.transaction?.url || tapCharge.redirect_url || null;
    const tapChargeId = tapCharge.id;

    if (!paymentUrl) {
      throw new Error('Payment URL was not provided by TAP');
    }

    // Persist tap_charge_id on the payment row for webhook lookup
    const { error: updateError } = await supabase
      .from('addon_payments')
      .update({ tap_charge_id: tapChargeId })
      .eq('id', addonPaymentId);
    if (updateError) {
      console.error(JSON.stringify({ fn: "create-tap-addon-payment", step: "link_charge", ok: false, error: updateError.code }));
      // Non-fatal -- webhook can still find the row via metadata.addon_payment_id
    }

    console.log(JSON.stringify({ fn: "create-tap-addon-payment", step: "ok", ok: true, addon_payment_id: addonPaymentId, charge_id: tapChargeId }));

    return new Response(
      JSON.stringify({
        success: true,
        paymentUrl,
        chargeId: tapChargeId,
        addonPaymentId,
        amountKwd: totalKwd,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(JSON.stringify({ fn: "create-tap-addon-payment", step: "fatal", ok: false, error: error instanceof Error ? error.message : 'unknown' }));
    return new Response(
      JSON.stringify({ success: false, error: 'Payment processing failed. Please try again.' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
