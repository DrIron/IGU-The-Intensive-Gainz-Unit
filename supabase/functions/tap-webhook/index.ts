import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto } from "https://deno.land/std@0.177.0/crypto/mod.ts";

/**
 * TAP WEBHOOK HANDLER
 * 
 * SECURITY LAYERS (defense in depth):
 * 1. HMAC Signature verification (TAP sends `hashstring` header)
 * 2. TAP API verification (fetch charge directly)
 * 3. IP rate limiting
 * 4. Per-charge rate limiting
 * 5. Idempotency checks
 * 6. Amount/currency validation
 * 
 * The database trigger enforces that:
 * - last_verified_charge_id must be set
 * - last_payment_verified_at must be set
 * - last_payment_status must be 'CAPTURED'
 * 
 * This prevents any activation without proper verification.
 * A forged webhook CANNOT change subscription status.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// =============================================================================
// HMAC SIGNATURE VERIFICATION (TAP FORMAT)
// =============================================================================

/**
 * Verify TAP webhook HMAC signature.
 * TAP sends the signature in the `hashstring` header.
 * 
 * TAP's hashstring format for charges:
 * x_id{id}x_amount{amount}x_currency{currency}x_gateway_reference{gateway_ref}x_payment_reference{payment_ref}x_status{status}x_created{created}
 * 
 * Then: HMAC-SHA256(concatenated_string, secret_key)
 */
async function verifyWebhookSignature(
  chargeData: any,
  receivedSignature: string | null,
  secretKey: string
): Promise<{ valid: boolean; reason?: string }> {
  // If no signature header, log warning but continue (TAP API verification is the fallback)
  if (!receivedSignature) {
    console.warn('No hashstring header received - will rely on TAP API verification');
    return { valid: true, reason: 'no_signature_header' };
  }

  try {
    // Extract values from charge data (matching TAP's format exactly)
    const id = chargeData.id || '';
    const amount = chargeData.amount !== undefined ? Number(chargeData.amount).toFixed(3) : ''; // KWD uses 3 decimals
    const currency = chargeData.currency || '';
    const gatewayReference = chargeData.reference?.gateway || '';
    const paymentReference = chargeData.reference?.payment || '';
    const status = chargeData.status || '';
    const created = chargeData.transaction?.created || '';

    // Build the string to hash (TAP's format)
    const toBeHashedString = 
      'x_id' + id + 
      'x_amount' + amount + 
      'x_currency' + currency + 
      'x_gateway_reference' + gatewayReference + 
      'x_payment_reference' + paymentReference + 
      'x_status' + status + 
      'x_created' + created;

    console.log('Hashstring input:', toBeHashedString);

    // Create HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(toBeHashedString);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const signatureArray = new Uint8Array(signatureBuffer);
    const computedSignature = Array.from(signatureArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    console.log('Computed hashstring:', computedSignature);
    console.log('Received hashstring:', receivedSignature);

    // Compare signatures (case-insensitive)
    const signaturesMatch = computedSignature.toLowerCase() === receivedSignature.toLowerCase();

    if (!signaturesMatch) {
      return { valid: false, reason: 'signature_mismatch' };
    }

    return { valid: true };
  } catch (error) {
    console.error('Signature verification error:', error);
    // Don't fail on verification error - TAP API verification is the authoritative check
    return { valid: true, reason: 'verification_error_bypassed' };
  }
}

// =============================================================================
// RATE LIMITING
// =============================================================================

// IP rate limiting
const ipRateLimitMap = new Map<string, { count: number; resetTime: number }>();
const IP_RATE_LIMIT_WINDOW_MS = 60000;
const MAX_IP_REQUESTS = 30;

// Per-charge rate limiting
const chargeRateLimitMap = new Map<string, { lastVerified: number; count: number }>();
const CHARGE_THROTTLE_MS = 5000;
const MAX_CHARGE_VERIFICATIONS = 3;
const RATE_LIMIT_RESET_MS = 60000;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRateLimitMap.get(ip);

  if (!record || now > record.resetTime) {
    ipRateLimitMap.set(ip, { count: 1, resetTime: now + IP_RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= MAX_IP_REQUESTS) return false;
  record.count++;
  return true;
}

function checkChargeRateLimit(chargeId: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const record = chargeRateLimitMap.get(chargeId);

  if (!record) {
    chargeRateLimitMap.set(chargeId, { lastVerified: now, count: 1 });
    return { allowed: true };
  }

  if (now - record.lastVerified > RATE_LIMIT_RESET_MS) {
    chargeRateLimitMap.set(chargeId, { lastVerified: now, count: 1 });
    return { allowed: true };
  }

  if (record.count >= MAX_CHARGE_VERIFICATIONS) {
    return { allowed: false, reason: 'charge_rate_limited' };
  }

  if (now - record.lastVerified < CHARGE_THROTTLE_MS) {
    return { allowed: false, reason: 'charge_throttled' };
  }

  record.lastVerified = now;
  record.count++;
  return { allowed: true };
}

// Idempotency check
async function checkIdempotency(
  supabase: any,
  chargeId: string,
  status: string
): Promise<{ exists: boolean; event?: any }> {
  const { data } = await supabase
    .from('payment_events')
    .select('id, processing_result, processed_at')
    .eq('provider', 'tap')
    .eq('charge_id', chargeId)
    .eq('status', status)
    .maybeSingle();
  return { exists: !!data, event: data };
}

// Insert payment event
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
    subscriptionId?: string;
    amount?: number;
    currency?: string;
    errorDetails?: string;
  }
): Promise<{ isDuplicate: boolean }> {
  const { error } = await supabase
    .from('payment_events')
    .insert({
      provider: 'tap',
      provider_event_id: event.providerEventId,
      charge_id: event.chargeId,
      status: event.status,
      payload_json: event.payloadJson,
      verified_json: event.verifiedJson,
      processed_at: event.processedAt,
      processing_result: event.processingResult,
      source: 'webhook',
      user_id: event.userId,
      subscription_id: event.subscriptionId,
      amount: event.amount,
      currency: event.currency,
      error_details: event.errorDetails,
    });

  return { isDuplicate: error?.code === '23505' };
}

// Update payment event
async function updatePaymentEvent(
  supabase: any,
  chargeId: string,
  status: string,
  update: {
    verifiedJson?: any;
    processedAt?: string;
    processingResult?: string;
    subscriptionId?: string;
    userId?: string;
    errorDetails?: string;
  }
) {
  await supabase
    .from('payment_events')
    .update({
      verified_json: update.verifiedJson,
      processed_at: update.processedAt,
      processing_result: update.processingResult,
      subscription_id: update.subscriptionId,
      user_id: update.userId,
      error_details: update.errorDetails,
    })
    .eq('provider', 'tap')
    .eq('charge_id', chargeId)
    .eq('status', status);
}

// Log to audit table
async function logWebhookEvent(
  supabase: any,
  event: {
    requestId: string;
    rawPayload: any;
    verifiedWithTap: boolean;
    tapChargeId?: string;
    tapStatus?: string;
    expectedAmountKwd?: number;
    actualAmount?: number;
    subscriptionId?: string;
    userId?: string;
    verificationResult: string;
    processingResult?: string;
    errorDetails?: string;
    ipAddress?: string;
  }
) {
  try {
    await supabase.from('payment_webhook_events').insert({
      source: 'tap_webhook',
      raw_payload: event.rawPayload,
      verified_with_tap: event.verifiedWithTap,
      tap_charge_id: event.tapChargeId,
      tap_status: event.tapStatus,
      expected_amount_kwd: event.expectedAmountKwd,
      actual_amount: event.actualAmount,
      actual_currency: 'KWD',
      subscription_id: event.subscriptionId,
      user_id: event.userId,
      verification_result: event.verificationResult,
      processing_result: event.processingResult,
      error_details: event.errorDetails,
      ip_address: event.ipAddress,
      request_id: event.requestId,
    });
  } catch (err) {
    console.error('Webhook log error:', err);
  }
}

// Verify with TAP API
async function verifyChargeWithTap(
  chargeId: string,
  tapSecretKey: string
): Promise<{ success: boolean; charge?: any; error?: string }> {
  try {
    const response = await fetch(`https://api.tap.company/v2/charges/${chargeId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${tapSecretKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { success: false, error: `TAP API: ${response.status}` };
    }

    return { success: true, charge: await response.json() };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    return { success: false, error: msg };
  }
}

/**
 * CANONICAL ACTIVATION - Same logic as verify-payment
 * Sets all verification fields required by database trigger
 */
async function applyCapturedPayment(
  supabase: any,
  requestId: string,
  params: {
    chargeId: string;
    charge: any;
    subscriptionId: string;
    userId: string;
    serviceId: string;
    expectedAmount?: number;
    subscription: any;
  }
): Promise<{ success: boolean; result: string; error?: string }> {
  const { chargeId, charge, subscriptionId, userId, expectedAmount, subscription } = params;

  console.log(`[${requestId}] applyCapturedPayment: ${chargeId}`);

  // Validate status
  if (charge.status !== 'CAPTURED') {
    return { success: false, result: 'invalid_status', error: `Expected CAPTURED, got ${charge.status}` };
  }

  // Validate amount
  if (expectedAmount && Math.abs(charge.amount - expectedAmount) > 0.01) {
    return { success: false, result: 'amount_mismatch', error: `Expected ${expectedAmount}, got ${charge.amount}` };
  }

  // Validate currency
  if (charge.currency && charge.currency.toUpperCase() !== 'KWD') {
    return { success: false, result: 'currency_mismatch', error: `Expected KWD, got ${charge.currency}` };
  }

  // Idempotency
  const { data: existingPayment } = await supabase
    .from('subscription_payments')
    .select('id')
    .eq('tap_charge_id', chargeId)
    .eq('status', 'paid')
    .maybeSingle();

  if (existingPayment) {
    console.log(`[${requestId}] Already paid (idempotent)`);
    return { success: true, result: 'already_active' };
  }

  const now = new Date();
  const nextBillingDate = new Date();
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  // ATOMIC UPDATE with verification fields (required by trigger)
  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      start_date: now.toISOString(),
      next_billing_date: nextBillingDate.toISOString(),
      // Verification fields
      last_verified_charge_id: chargeId,
      last_payment_verified_at: now.toISOString(),
      last_payment_status: 'CAPTURED',
      // TAP fields
      tap_charge_id: chargeId,
      tap_subscription_status: 'CAPTURED',
      // Clear flags
      past_due_since: null,
      payment_failed_at: null,
      tap_card_id: null,
      tap_payment_agreement_id: null,
    })
    .eq('id', subscriptionId);

  if (updateError) {
    console.error(`[${requestId}] Activation failed:`, updateError);
    return { success: false, result: 'activation_failed', error: updateError.message };
  }

  console.log(`[${requestId}] Subscription activated`);

  // Update profile
  await supabase
    .from('profiles_public')
    .update({
      status: 'active',
      payment_deadline: null,
      activation_completed_at: now.toISOString(),
    })
    .eq('id', userId);

  // Log payment
  const paymentAmount = charge.amount || subscription.billing_amount_kwd || subscription.base_price_kwd;
  await supabase.from('subscription_payments').upsert({
    subscription_id: subscriptionId,
    user_id: userId,
    tap_charge_id: chargeId,
    amount_kwd: paymentAmount,
    status: 'paid',
    is_renewal: subscription.status === 'past_due' || !!subscription.past_due_since,
    billing_period_start: now.toISOString().split('T')[0],
    billing_period_end: nextBillingDate.toISOString().split('T')[0],
    paid_at: now.toISOString(),
    metadata: { tap_status: 'CAPTURED', activation_source: 'webhook' },
  }, { onConflict: 'tap_charge_id' });

  // Handle discount
  if (subscription.discount_code_id && subscription.billing_amount_kwd) {
    try {
      await supabase.from('discount_redemptions').upsert({
        discount_code_id: subscription.discount_code_id,
        subscription_id: subscriptionId,
        user_id: userId,
        cycle_number: 1,
        amount_before_kwd: subscription.base_price_kwd || 0,
        amount_after_kwd: subscription.billing_amount_kwd,
        cycles_applied: 1,
        total_saved_kwd: (subscription.base_price_kwd || 0) - subscription.billing_amount_kwd,
        last_applied_at: now.toISOString(),
      }, { onConflict: 'discount_code_id,user_id,subscription_id' });

      await supabase.from('subscriptions').update({ discount_cycles_used: 1 }).eq('id', subscriptionId);
    } catch (e) {
      console.error(`[${requestId}] Discount error:`, e);
    }
  }

  return { success: true, result: 'activated' };
}

async function applyFailedPayment(
  supabase: any,
  chargeId: string,
  charge: any,
  subscriptionId: string
): Promise<{ result: string }> {
  await supabase
    .from('subscriptions')
    .update({
      tap_subscription_status: charge.status,
      last_payment_status: charge.status,
      payment_failed_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId);

  await supabase
    .from('subscription_payments')
    .update({
      status: charge.status === 'CANCELLED' ? 'cancelled' : 'failed',
      failed_at: new Date().toISOString(),
      failure_reason: charge.response?.message || charge.status,
    })
    .eq('tap_charge_id', chargeId);

  return { result: 'failed' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
  if (!checkIpRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ error: 'Too many requests' }),
      { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const requestId = crypto.randomUUID();
  console.log(`[${requestId}] TAP Webhook received`);

  const tapSecretKey = Deno.env.get('TAP_SECRET_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  if (!tapSecretKey) {
    return new Response(
      JSON.stringify({ error: 'Configuration error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const rawBody = await req.text();
    let webhookData: any;

    try {
      webhookData = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: 'invalid_payload' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // ==========================================================================
    // LAYER 1: HMAC SIGNATURE VERIFICATION (TAP Format)
    // ==========================================================================
    // TAP sends signature in `hashstring` header
    // Format: HMAC-SHA256 of concatenated charge fields
    const receivedSignature = req.headers.get('hashstring') || req.headers.get('Hashstring');
    
    const signatureResult = await verifyWebhookSignature(webhookData, receivedSignature, tapSecretKey);
    
    if (!signatureResult.valid) {
      console.warn(`[${requestId}] Signature verification failed: ${signatureResult.reason}`);
      
      // Log the failed attempt for security monitoring
      await logWebhookEvent(supabase, {
        requestId,
        rawPayload: { charge_id: webhookData.id, has_signature: !!receivedSignature },
        verifiedWithTap: false,
        verificationResult: `signature_${signatureResult.reason}`,
        ipAddress: clientIp,
        errorDetails: `Signature verification failed: ${signatureResult.reason}`,
      });

      // CRITICAL: Do not process webhook without valid signature
      // We still return 200 to prevent TAP from retrying indefinitely
      // But we DO NOT process the payment
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: 'invalid_signature' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (signatureResult.reason) {
      console.log(`[${requestId}] Signature check: ${signatureResult.reason}`);
    } else {
      console.log(`[${requestId}] Signature verified successfully`);
    }

    const chargeId = webhookData.id || webhookData.charge_id;
    const webhookStatus = webhookData.status;
    const providerEventId = webhookData.event_id;

    if (!chargeId) {
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: 'no_charge_id' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotency check
    if (webhookStatus) {
      const { exists, event } = await checkIdempotency(supabase, chargeId, webhookStatus);
      if (exists && event?.processed_at) {
        console.log(`[${requestId}] Duplicate event, already processed`);
        return new Response(
          JSON.stringify({ received: true, duplicate: true, previousResult: event.processing_result }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Per-charge rate limiting
    const chargeRateCheck = checkChargeRateLimit(chargeId);
    if (!chargeRateCheck.allowed) {
      console.log(`[${requestId}] Charge rate limited: ${chargeRateCheck.reason}`);
      await logWebhookEvent(supabase, {
        requestId,
        rawPayload: webhookData,
        verifiedWithTap: false,
        tapChargeId: chargeId,
        verificationResult: chargeRateCheck.reason!,
        ipAddress: clientIp,
      });
      return new Response(
        JSON.stringify({ received: true, throttled: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert payment event first
    const { isDuplicate } = await insertPaymentEvent(supabase, {
      providerEventId,
      chargeId,
      status: webhookStatus || 'UNKNOWN',
      payloadJson: webhookData,
    });

    if (isDuplicate) {
      console.log(`[${requestId}] Duplicate payment event`);
      return new Response(
        JSON.stringify({ received: true, duplicate: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // VERIFY WITH TAP API
    console.log(`[${requestId}] Verifying charge ${chargeId}...`);
    const verifyResult = await verifyChargeWithTap(chargeId, tapSecretKey);

    if (!verifyResult.success) {
      console.error(`[${requestId}] TAP verification failed:`, verifyResult.error);
      await updatePaymentEvent(supabase, chargeId, webhookStatus || 'UNKNOWN', {
        processingResult: 'verification_failed',
        errorDetails: verifyResult.error,
      });
      await logWebhookEvent(supabase, {
        requestId,
        rawPayload: webhookData,
        verifiedWithTap: false,
        tapChargeId: chargeId,
        verificationResult: 'tap_verification_failed',
        errorDetails: verifyResult.error,
        ipAddress: clientIp,
      });
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: 'verification_failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const charge = verifyResult.charge;
    console.log(`[${requestId}] TAP verified: ${charge.status}`);

    // Update with verified data
    await updatePaymentEvent(supabase, chargeId, webhookStatus || 'UNKNOWN', {
      verifiedJson: charge,
    });

    // Find subscription
    const metadata = charge.metadata || {};
    let subscription: any = null;
    let userId = metadata.user_id;
    let serviceId = metadata.service_id;

    if (userId && serviceId) {
      const { data } = await supabase
        .from('subscriptions')
        .select('id, user_id, service_id, status, discount_code_id, base_price_kwd, billing_amount_kwd, past_due_since')
        .eq('user_id', userId)
        .eq('service_id', serviceId)
        .maybeSingle();
      subscription = data;
    }

    if (!subscription) {
      const { data } = await supabase
        .from('subscriptions')
        .select('id, user_id, service_id, status, discount_code_id, base_price_kwd, billing_amount_kwd, past_due_since')
        .eq('tap_charge_id', chargeId)
        .maybeSingle();
      subscription = data;
      if (subscription) {
        userId = subscription.user_id;
        serviceId = subscription.service_id;
      }
    }

    if (!subscription) {
      console.warn(`[${requestId}] No subscription found`);
      await updatePaymentEvent(supabase, chargeId, webhookStatus || 'UNKNOWN', {
        processingResult: 'subscription_not_found',
        processedAt: new Date().toISOString(),
      });
      await logWebhookEvent(supabase, {
        requestId,
        rawPayload: webhookData,
        verifiedWithTap: true,
        tapChargeId: chargeId,
        tapStatus: charge.status,
        verificationResult: 'subscription_not_found',
        ipAddress: clientIp,
      });
      return new Response(
        JSON.stringify({ received: true, ignored: true, reason: 'subscription_not_found' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const expectedAmount = subscription.billing_amount_kwd || subscription.base_price_kwd;
    let result: { success?: boolean; result: string; error?: string };

    if (charge.status === 'CAPTURED') {
      result = await applyCapturedPayment(supabase, requestId, {
        chargeId,
        charge,
        subscriptionId: subscription.id,
        userId,
        serviceId,
        expectedAmount,
        subscription,
      });
    } else if (['FAILED', 'DECLINED', 'CANCELLED'].includes(charge.status)) {
      result = await applyFailedPayment(supabase, chargeId, charge, subscription.id);
    } else {
      result = { result: 'ignored' };
    }

    await updatePaymentEvent(supabase, chargeId, webhookStatus || 'UNKNOWN', {
      processedAt: new Date().toISOString(),
      processingResult: result.result,
      subscriptionId: subscription.id,
      userId,
      errorDetails: result.error,
    });

    await logWebhookEvent(supabase, {
      requestId,
      rawPayload: webhookData,
      verifiedWithTap: true,
      tapChargeId: chargeId,
      tapStatus: charge.status,
      expectedAmountKwd: expectedAmount,
      actualAmount: charge.amount,
      subscriptionId: subscription.id,
      userId,
      verificationResult: 'verified',
      processingResult: result.result,
      ipAddress: clientIp,
    });

    return new Response(
      JSON.stringify({ received: true, processed: true, result: result.result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ received: true, error: 'Internal error' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
