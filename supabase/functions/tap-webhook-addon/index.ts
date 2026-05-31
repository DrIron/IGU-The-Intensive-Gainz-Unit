import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";
import { APP_BASE_URL, EMAIL_FROM_BILLING } from "../_shared/config.ts";
import { wrapInLayout } from "../_shared/emailTemplate.ts";
import { greeting, paragraph, alertBox, detailCard, ctaButton, signOff } from "../_shared/emailComponents.ts";
import { sendEmail } from "../_shared/sendEmail.ts";

/**
 * TAP WEBHOOK -- ADDON FLOW
 *
 * Dedicated webhook for addon-services purchases. Lives at
 * /functions/v1/tap-webhook-addon and is only used by charges created via
 * create-tap-addon-payment (which sets post.url accordingly).
 *
 * Isolation rationale: zero risk to the subscription tap-webhook hot path.
 * Code duplication with tap-webhook (HMAC, IP rate-limit, payment_events
 * idempotency, TAP re-verify) is accepted as a launch-time tax. Both
 * webhooks share the payment_events table for cross-flow idempotency.
 *
 * Status handlers:
 *   CAPTURED  -> applyCapturedAddonPayment (updates addon_payments,
 *                calls purchase_addon_atomic to materialise the purchase,
 *                fires confirmation email)
 *   FAILED / DECLINED / CANCELLED -> applyFailedAddonPayment
 *   REFUNDED / VOIDED -> applyRefundedOrVoidedAddonPayment (flips both
 *                the original addon_payments row AND any addon_purchases
 *                row tied to it)
 *
 * Defense in depth: rejects payloads where metadata.billing_type != 'addon'
 * (if someone misroutes a subscription charge here, fail loudly).
 *
 * Deploy: supabase functions deploy tap-webhook-addon --no-verify-jwt
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// HMAC SIGNATURE VERIFICATION (TAP format)
// =============================================================================

async function verifyWebhookSignature(
  chargeData: any,
  receivedSignature: string | null,
  secretKey: string
): Promise<{ valid: boolean; reason?: string }> {
  if (!receivedSignature) {
    return { valid: false, reason: 'no_signature_header' };
  }
  try {
    const id = chargeData.id || '';
    const amount = chargeData.amount !== undefined ? Number(chargeData.amount).toFixed(3) : '';
    const currency = chargeData.currency || '';
    const gatewayRef = chargeData.reference?.gateway || '';
    const paymentRef = chargeData.reference?.payment || '';
    const status = chargeData.status || '';
    const created = chargeData.transaction?.created || '';

    const toHash =
      'x_id' + id +
      'x_amount' + amount +
      'x_currency' + currency +
      'x_gateway_reference' + gatewayRef +
      'x_payment_reference' + paymentRef +
      'x_status' + status +
      'x_created' + created;

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(toHash));
    const computed = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
    return computed.toLowerCase() === receivedSignature.toLowerCase()
      ? { valid: true }
      : { valid: false, reason: 'signature_mismatch' };
  } catch {
    return { valid: false, reason: 'verification_error' };
  }
}

// =============================================================================
// RATE LIMITING
// =============================================================================

const ipRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const IP_RATE_WINDOW_MS = 60_000;
const MAX_IP_REQUESTS = 30;

const chargeRateLimitMap = new Map<string, { lastVerified: number; count: number }>();
const CHARGE_THROTTLE_MS = 5_000;
const MAX_CHARGE_VERIFICATIONS = 3;
const RATE_LIMIT_RESET_MS = 60_000;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const rec = ipRateLimitMap.get(ip);
  if (!rec || now > rec.resetTime) {
    ipRateLimitMap.set(ip, { count: 1, resetTime: now + IP_RATE_WINDOW_MS });
    return true;
  }
  if (rec.count >= MAX_IP_REQUESTS) return false;
  rec.count++;
  return true;
}

function checkChargeRateLimit(chargeId: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const rec = chargeRateLimitMap.get(chargeId);
  if (!rec) {
    chargeRateLimitMap.set(chargeId, { lastVerified: now, count: 1 });
    return { allowed: true };
  }
  if (now - rec.lastVerified > RATE_LIMIT_RESET_MS) {
    chargeRateLimitMap.set(chargeId, { lastVerified: now, count: 1 });
    return { allowed: true };
  }
  if (rec.count >= MAX_CHARGE_VERIFICATIONS) return { allowed: false, reason: 'rate_limited' };
  if (now - rec.lastVerified < CHARGE_THROTTLE_MS) return { allowed: false, reason: 'throttled' };
  rec.lastVerified = now;
  rec.count++;
  return { allowed: true };
}

// =============================================================================
// IDEMPOTENCY
// =============================================================================

async function checkIdempotency(supabase: any, chargeId: string, status: string) {
  const { data } = await supabase
    .from('payment_events')
    .select('id, processing_result, processed_at')
    .eq('provider', 'tap')
    .eq('charge_id', chargeId)
    .eq('status', status)
    .maybeSingle();
  return { exists: !!data, event: data };
}

async function insertPaymentEvent(
  supabase: any,
  event: {
    providerEventId?: string;
    chargeId: string;
    status: string;
    payloadJson: any;
    verifiedJson?: any;
    processedAt?: string;
    processingResult?: string;
    userId?: string;
    amount?: number;
    currency?: string;
    errorDetails?: string;
  }
): Promise<{ isDuplicate: boolean }> {
  const { error } = await supabase.from('payment_events').insert({
    provider: 'tap',
    provider_event_id: event.providerEventId,
    charge_id: event.chargeId,
    status: event.status,
    payload_json: event.payloadJson,
    verified_json: event.verifiedJson,
    processed_at: event.processedAt,
    processing_result: event.processingResult,
    source: 'webhook_addon',
    user_id: event.userId,
    amount: event.amount,
    currency: event.currency,
    error_details: event.errorDetails,
  });
  return { isDuplicate: error?.code === '23505' };
}

async function updatePaymentEvent(
  supabase: any,
  chargeId: string,
  status: string,
  update: { verifiedJson?: any; processedAt?: string; processingResult?: string; userId?: string; errorDetails?: string }
) {
  await supabase
    .from('payment_events')
    .update({
      verified_json: update.verifiedJson,
      processed_at: update.processedAt,
      processing_result: update.processingResult,
      user_id: update.userId,
      error_details: update.errorDetails,
    })
    .eq('provider', 'tap')
    .eq('charge_id', chargeId)
    .eq('status', status);
}

// =============================================================================
// TAP API RE-VERIFY
// =============================================================================

async function verifyChargeWithTap(chargeId: string, tapSecretKey: string) {
  try {
    const response = await fetch(`https://api.tap.company/v2/charges/${chargeId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tapSecretKey}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) return { success: false, error: `TAP API: ${response.status}` };
    return { success: true, charge: await response.json() };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    return { success: false, error: msg };
  }
}

// =============================================================================
// CAPTURED -- update payment + materialise purchase via RPC
// =============================================================================

async function applyCapturedAddonPayment(
  supabase: any,
  requestId: string,
  params: {
    chargeId: string;
    charge: any;
    addonPaymentId: string;
    clientId: string;
    addonServiceId: string;
    quantity: number;
    expectedAmount: number;
  }
): Promise<{ success: boolean; result: string; error?: string; purchaseId?: string }> {
  const { chargeId, charge, addonPaymentId, clientId, addonServiceId, quantity, expectedAmount } = params;

  // Validations matching tap-webhook
  if (charge.status !== 'CAPTURED') {
    return { success: false, result: 'invalid_status', error: `Expected CAPTURED, got ${charge.status}` };
  }
  if (Math.abs(charge.amount - expectedAmount) > 0.001) {
    return { success: false, result: 'amount_mismatch', error: `Expected ${expectedAmount}, got ${charge.amount}` };
  }
  if (charge.currency && charge.currency.toUpperCase() !== 'KWD') {
    return { success: false, result: 'currency_mismatch', error: `Expected KWD, got ${charge.currency}` };
  }

  // Idempotency: if a purchase already exists for this payment, we're done
  const { data: existingPurchase } = await supabase
    .from('addon_purchases')
    .select('id, status')
    .eq('payment_id', addonPaymentId)
    .maybeSingle();
  if (existingPurchase) {
    console.log(JSON.stringify({ fn: "tap-webhook-addon", step: "purchase_already_exists", requestId, chargeId, ok: true }));
    return { success: true, result: 'already_active', purchaseId: existingPurchase.id };
  }

  const now = new Date();

  // 1. Mark payment as paid (so purchase_addon_atomic's status='paid' check passes)
  const { error: payUpdateError } = await supabase
    .from('addon_payments')
    .update({
      status: 'paid',
      paid_at: now.toISOString(),
      tap_charge_id: chargeId,
    })
    .eq('id', addonPaymentId);
  if (payUpdateError) {
    console.error(JSON.stringify({ fn: "tap-webhook-addon", step: "payment_update_failed", requestId, chargeId, ok: false }));
    return { success: false, result: 'payment_update_failed', error: payUpdateError.message };
  }

  // 2. Materialise purchase
  const { data: rpcResult, error: rpcError } = await supabase.rpc('purchase_addon_atomic', {
    p_client_id:         clientId,
    p_addon_service_id:  addonServiceId,
    p_payment_id:        addonPaymentId,
    p_quantity:          quantity,
    p_discount_percent:  0,
  });
  if (rpcError) {
    console.error(JSON.stringify({ fn: "tap-webhook-addon", step: "rpc_error", requestId, chargeId, ok: false, error: rpcError.message }));
    return { success: false, result: 'rpc_failed', error: rpcError.message };
  }
  const purchaseId = rpcResult?.purchase_id;

  console.log(JSON.stringify({ fn: "tap-webhook-addon", step: "purchase_materialised", requestId, chargeId, purchase_id: purchaseId, ok: true }));

  // 3. Send confirmation email (non-blocking)
  sendAddonConfirmationEmail(supabase, requestId, {
    clientId,
    addonServiceId,
    quantity,
    amountKwd: charge.amount,
    expiresAt: rpcResult?.expires_at,
    sessionsTotal: rpcResult?.sessions_total,
  }).catch(() => {});

  return { success: true, result: 'activated', purchaseId };
}

async function applyFailedAddonPayment(
  supabase: any,
  chargeId: string,
  charge: any,
  addonPaymentId: string
): Promise<{ result: string }> {
  const { error } = await supabase
    .from('addon_payments')
    .update({
      status: charge.status === 'CANCELLED' ? 'failed' : 'failed',
      failed_at: new Date().toISOString(),
      failure_reason: charge.response?.message || charge.status,
    })
    .eq('id', addonPaymentId);
  if (error) throw error;
  return { result: 'failed' };
}

/**
 * REFUNDED / VOIDED -- flip both the addon_payments row AND any
 * addon_purchases row tied to it. Idempotent: re-running is safe.
 */
async function applyRefundedOrVoidedAddonPayment(
  supabase: any,
  chargeId: string,
  charge: any,
  addonPaymentId: string
): Promise<{ result: string }> {
  const now = new Date().toISOString();
  const isRefund = charge.status === 'REFUNDED';

  // Flip original payment
  const { error: payError } = await supabase
    .from('addon_payments')
    .update({
      status: isRefund ? 'refunded' : 'voided',
      refunded_at: now,
    })
    .eq('id', addonPaymentId);
  if (payError) throw payError;

  // Flip the purchase row (if it was already materialised)
  const { error: purchaseError } = await supabase
    .from('addon_purchases')
    .update({
      status: isRefund ? 'refunded' : 'voided',
    })
    .eq('payment_id', addonPaymentId);
  if (purchaseError) throw purchaseError;

  return { result: isRefund ? 'refunded' : 'voided' };
}

async function sendAddonConfirmationEmail(
  supabase: any,
  requestId: string,
  params: {
    clientId: string;
    addonServiceId: string;
    quantity: number;
    amountKwd: number;
    expiresAt?: string;
    sessionsTotal?: number;
  }
) {
  try {
    const { data: profile } = await supabase
      .from('profiles_private')
      .select('email, first_name')
      .eq('profile_id', params.clientId)
      .maybeSingle();
    if (!profile?.email) return;

    const { data: service } = await supabase
      .from('addon_services')
      .select('name, type')
      .eq('id', params.addonServiceId)
      .maybeSingle();
    if (!service?.name) return;

    const fullName = profile.first_name?.trim() || 'Valued Client';
    const expires = params.expiresAt
      ? new Date(params.expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      : '--';
    const sessionsLine = params.sessionsTotal && params.sessionsTotal > 1
      ? `${params.sessionsTotal} sessions`
      : '1 session';

    const content = [
      greeting(fullName),
      alertBox(
        `<strong>Purchase confirmed!</strong><br>Your <strong>${service.name}</strong> is now active.`,
        'success'
      ),
      detailCard('Purchase Details', [
        { label: 'Add-on',     value: `${service.name}${params.quantity > 1 ? ` (x${params.quantity})` : ''}` },
        { label: 'Sessions',   value: sessionsLine },
        { label: 'Amount',     value: `${params.amountKwd.toFixed(2)} KWD` },
        { label: 'Valid until', value: expires },
      ]),
      paragraph(`<strong>What's next?</strong><br>Your coach or specialist will reach out to schedule your sessions. You can also view your active add-ons in your dashboard.`),
      ctaButton('Go to Dashboard', `${APP_BASE_URL}/dashboard`),
      signOff(),
    ].join('');

    const html = wrapInLayout({
      content,
      preheader: `Your ${service.name} purchase is confirmed.`,
    });

    const result = await sendEmail({
      from: EMAIL_FROM_BILLING,
      to: profile.email,
      subject: `${service.name} -- Purchase Confirmed`,
      html,
    });
    if (!result.success) {
      console.log(JSON.stringify({ fn: "tap-webhook-addon", step: "email_failed", requestId, ok: false }));
    }
  } catch {
    console.log(JSON.stringify({ fn: "tap-webhook-addon", step: "email_error", requestId, ok: false }));
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkIpRateLimit(clientIp)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const requestId = crypto.randomUUID();
  const tapSecretKey = Deno.env.get('TAP_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  if (!tapSecretKey) {
    return new Response(JSON.stringify({ error: 'Configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawBody = await req.text();
    let webhookData: any;
    try {
      webhookData = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ received: true, ignored: true, reason: 'invalid_payload' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // HMAC verify
    const receivedSig = req.headers.get('hashstring') || req.headers.get('Hashstring');
    const sigResult = await verifyWebhookSignature(webhookData, receivedSig, tapSecretKey);
    if (!sigResult.valid) {
      console.warn(JSON.stringify({ fn: "tap-webhook-addon", step: "signature_failed", requestId, reason: sigResult.reason, ok: false }));
      return new Response(JSON.stringify({ received: true, ignored: true, reason: 'invalid_signature' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chargeId = webhookData.id || webhookData.charge_id;
    const webhookStatus = webhookData.status;
    const providerEventId = webhookData.event_id;
    if (!chargeId) {
      return new Response(JSON.stringify({ received: true, ignored: true, reason: 'no_charge_id' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Idempotency on payment_events
    if (webhookStatus) {
      const { exists, event } = await checkIdempotency(supabase, chargeId, webhookStatus);
      if (exists && event?.processed_at) {
        return new Response(JSON.stringify({ received: true, duplicate: true, previousResult: event.processing_result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const chargeRate = checkChargeRateLimit(chargeId);
    if (!chargeRate.allowed) {
      return new Response(JSON.stringify({ received: true, throttled: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert event row
    const { isDuplicate } = await insertPaymentEvent(supabase, {
      providerEventId,
      chargeId,
      status: webhookStatus || 'UNKNOWN',
      payloadJson: webhookData,
    });
    if (isDuplicate) {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Tap re-verify
    const verifyResult = await verifyChargeWithTap(chargeId, tapSecretKey);
    if (!verifyResult.success) {
      await updatePaymentEvent(supabase, chargeId, webhookStatus || 'UNKNOWN', {
        processingResult: 'verification_failed',
        errorDetails: verifyResult.error,
      });
      return new Response(JSON.stringify({ received: true, ignored: true, reason: 'verification_failed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const charge = verifyResult.charge;

    await updatePaymentEvent(supabase, chargeId, webhookStatus || 'UNKNOWN', { verifiedJson: charge });

    // Defense-in-depth: reject non-addon billing types on this webhook
    const metadata = charge.metadata || {};
    if (metadata.billing_type && metadata.billing_type !== 'addon') {
      console.warn(JSON.stringify({ fn: "tap-webhook-addon", step: "wrong_billing_type", requestId, chargeId, billing_type: metadata.billing_type, ok: false }));
      await updatePaymentEvent(supabase, chargeId, webhookStatus || 'UNKNOWN', {
        processedAt: new Date().toISOString(),
        processingResult: 'wrong_billing_type',
        errorDetails: `Expected addon, got ${metadata.billing_type}`,
      });
      return new Response(JSON.stringify({ received: true, ignored: true, reason: 'wrong_billing_type' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the addon_payments row -- primary lookup by metadata.addon_payment_id
    let addonPaymentRow: any = null;
    const metaPaymentId = metadata.addon_payment_id;
    if (metaPaymentId) {
      const { data } = await supabase
        .from('addon_payments')
        .select('id, client_id, amount_kwd, status, metadata')
        .eq('id', metaPaymentId)
        .maybeSingle();
      addonPaymentRow = data;
    }
    // Fallback: lookup by tap_charge_id (in case metadata is missing)
    if (!addonPaymentRow) {
      const { data } = await supabase
        .from('addon_payments')
        .select('id, client_id, amount_kwd, status, metadata')
        .eq('tap_charge_id', chargeId)
        .maybeSingle();
      addonPaymentRow = data;
    }

    if (!addonPaymentRow) {
      console.warn(JSON.stringify({ fn: "tap-webhook-addon", step: "no_addon_payment", requestId, chargeId, ok: false }));
      await updatePaymentEvent(supabase, chargeId, webhookStatus || 'UNKNOWN', {
        processedAt: new Date().toISOString(),
        processingResult: 'addon_payment_not_found',
      });
      return new Response(JSON.stringify({ received: true, ignored: true, reason: 'addon_payment_not_found' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const addonServiceId = metadata.addon_service_id || addonPaymentRow.metadata?.addon_service_id;
    const quantity = parseInt(String(metadata.quantity || addonPaymentRow.metadata?.quantity || '1'), 10);
    const clientId = addonPaymentRow.client_id;

    let result: { success?: boolean; result: string; error?: string; purchaseId?: string };

    if (charge.status === 'CAPTURED') {
      result = await applyCapturedAddonPayment(supabase, requestId, {
        chargeId,
        charge,
        addonPaymentId: addonPaymentRow.id,
        clientId,
        addonServiceId,
        quantity,
        expectedAmount: addonPaymentRow.amount_kwd,
      });
    } else if (['FAILED', 'DECLINED', 'CANCELLED'].includes(charge.status)) {
      result = await applyFailedAddonPayment(supabase, chargeId, charge, addonPaymentRow.id);
    } else if (['REFUNDED', 'VOIDED'].includes(charge.status)) {
      result = await applyRefundedOrVoidedAddonPayment(supabase, chargeId, charge, addonPaymentRow.id);
    } else {
      result = { result: 'ignored' };
    }

    await updatePaymentEvent(supabase, chargeId, webhookStatus || 'UNKNOWN', {
      processedAt: new Date().toISOString(),
      processingResult: result.result,
      userId: clientId,
      errorDetails: result.error,
    });

    return new Response(
      JSON.stringify({ received: true, processed: true, result: result.result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(JSON.stringify({ fn: "tap-webhook-addon", step: "unhandled_error", requestId, ok: false, error: error instanceof Error ? error.message : 'unknown' }));
    return new Response(
      JSON.stringify({ received: true, error: 'Internal error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
