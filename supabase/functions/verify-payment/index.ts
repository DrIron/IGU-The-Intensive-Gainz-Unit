import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_BASE_URL, EMAIL_FROM_BILLING, SUPPORT_EMAIL } from "../_shared/config.ts";
import { wrapInLayout } from "../_shared/emailTemplate.ts";
import { greeting, paragraph, alertBox, detailCard, ctaButton, signOff } from "../_shared/emailComponents.ts";
import { sendEmail } from "../_shared/sendEmail.ts";

/**
 * CANONICAL PAYMENT VERIFICATION ENDPOINT
 * 
 * This is the single source of truth for payment verification and subscription activation.
 * Both client-side verification (after checkout return) and webhook processing use this logic.
 * 
 * Flow:
 * 1. Verify charge with TAP API
 * 2. Validate amount, currency, subscription match
 * 3. Record verification in payment_events
 * 4. Call applyCapturedPayment() for activation
 * 5. Database trigger enforces verification requirement
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Per-charge rate limiting
const chargeRateLimitMap = new Map<string, { lastVerified: number; count: number }>();
const CHARGE_THROTTLE_MS = 5000;
const MAX_VERIFICATIONS_PER_MINUTE = 5;
const RATE_LIMIT_RESET_MS = 60000;

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

  if (record.count >= MAX_VERIFICATIONS_PER_MINUTE) {
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
    .select('id, processing_result, processed_at, subscription_id')
    .eq('provider', 'tap')
    .eq('charge_id', chargeId)
    .eq('status', status)
    .maybeSingle();
  return { exists: !!data, event: data };
}

// Upsert payment event
async function upsertPaymentEvent(
  supabase: any,
  event: {
    chargeId: string;
    status: string;
    payloadJson?: any;
    verifiedJson?: any;
    processedAt?: string;
    processingResult?: string;
    userId?: string;
    subscriptionId?: string;
    amount?: number;
    currency?: string;
    errorDetails?: string;
    source?: string;
  }
): Promise<{ isDuplicate: boolean }> {
  const { error } = await supabase
    .from('payment_events')
    .insert({
      provider: 'tap',
      charge_id: event.chargeId,
      status: event.status,
      payload_json: event.payloadJson || {},
      verified_json: event.verifiedJson,
      processed_at: event.processedAt,
      processing_result: event.processingResult,
      source: event.source || 'verify_payment',
      user_id: event.userId,
      subscription_id: event.subscriptionId,
      amount: event.amount,
      currency: event.currency,
      error_details: event.errorDetails,
    });

  if (error?.code === '23505') {
    // Duplicate - update instead
    await supabase
      .from('payment_events')
      .update({
        verified_json: event.verifiedJson,
        processed_at: event.processedAt,
        processing_result: event.processingResult,
        subscription_id: event.subscriptionId,
        user_id: event.userId,
        error_details: event.errorDetails,
      })
      .eq('provider', 'tap')
      .eq('charge_id', event.chargeId)
      .eq('status', event.status);
    return { isDuplicate: true };
  }

  return { isDuplicate: false };
}

/**
 * CANONICAL ACTIVATION FUNCTION
 * 
 * This is the ONLY function that should activate subscriptions.
 * It validates all payment data and sets the verification fields
 * that the database trigger requires.
 */
async function applyCapturedPayment(
  supabase: any,
  requestId: string,
  params: {
    chargeId: string;
    charge: any; // Verified charge from TAP API
    subscriptionId: string;
    userId: string;
    serviceId: string;
    expectedAmount?: number;
    subscription: any;
  }
): Promise<{ success: boolean; result: string; error?: string }> {
  const { chargeId, charge, subscriptionId, userId, serviceId, expectedAmount, subscription } = params;

  console.log(JSON.stringify({ fn: "verify-payment", step: "apply_captured", requestId, chargeId }));

  // VALIDATION 1: Status must be CAPTURED
  if (charge.status !== 'CAPTURED') {
    return { 
      success: false, 
      result: 'invalid_status', 
      error: `Expected CAPTURED, got ${charge.status}` 
    };
  }

  // VALIDATION 2: Amount validation (if expected amount provided)
  if (expectedAmount && Math.abs(charge.amount - expectedAmount) > 0.01) {
    console.log(JSON.stringify({ fn: "verify-payment", step: "amount_mismatch", requestId, chargeId, ok: false }));
    return { 
      success: false, 
      result: 'amount_mismatch', 
      error: `Expected ${expectedAmount} KWD, got ${charge.amount}` 
    };
  }

  // VALIDATION 3: Currency must be KWD
  if (charge.currency && charge.currency.toUpperCase() !== 'KWD') {
    console.log(JSON.stringify({ fn: "verify-payment", step: "currency_mismatch", requestId, chargeId, ok: false }));
    return { 
      success: false, 
      result: 'currency_mismatch', 
      error: `Expected KWD, got ${charge.currency}` 
    };
  }

  // IDEMPOTENCY: Check if already paid
  const { data: existingPayment } = await supabase
    .from('subscription_payments')
    .select('id')
    .eq('tap_charge_id', chargeId)
    .eq('status', 'paid')
    .maybeSingle();

  if (existingPayment) {
    console.log(JSON.stringify({ fn: "verify-payment", step: "already_paid", requestId, chargeId, ok: true }));
    return { success: true, result: 'already_active' };
  }

  const now = new Date();
  const nextBillingDate = new Date();
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  // ATOMIC UPDATE: Set all verification fields + status together
  // The database trigger will validate these fields before allowing activation
  const subscriptionUpdate = {
    status: 'active',
    start_date: now.toISOString(),
    next_billing_date: nextBillingDate.toISOString(),
    // Verification fields (required by trigger)
    last_verified_charge_id: chargeId,
    last_payment_verified_at: now.toISOString(),
    last_payment_status: 'CAPTURED',
    // TAP fields
    tap_charge_id: chargeId,
    tap_subscription_status: 'CAPTURED',
    // Clear failure/past-due flags
    past_due_since: null,
    payment_failed_at: null,
    // Ensure no card storage
    tap_card_id: null,
    tap_payment_agreement_id: null,
  };

  const { error: updateError } = await supabase
    .from('subscriptions')
    .update(subscriptionUpdate)
    .eq('id', subscriptionId);

  if (updateError) {
    console.log(JSON.stringify({ fn: "verify-payment", step: "activation_failed", requestId, chargeId, ok: false }));
    return { 
      success: false, 
      result: 'activation_failed', 
      error: updateError.message 
    };
  }

  console.log(JSON.stringify({ fn: "verify-payment", step: "subscription_activated", requestId, chargeId, subscriptionId, ok: true }));

  // Update profile status
  await supabase
    .from('profiles_public')
    .update({
      status: 'active',
      payment_deadline: null,
      activation_completed_at: now.toISOString(),
    })
    .eq('id', userId);

  // Log payment in subscription_payments
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
    metadata: { 
      tap_status: charge.status, 
      verified_at: now.toISOString(),
      activation_source: 'verify-payment'
    },
  }, { onConflict: 'tap_charge_id' });

  // Handle discount redemption on successful capture
  // Use discount_code_id from subscription OR from TAP metadata
  const discountCodeId = subscription.discount_code_id || charge.metadata?.discount_code_id;
  const basePrice = subscription.base_price_kwd || parseFloat(charge.metadata?.base_price_kwd || '0');
  const billingAmount = subscription.billing_amount_kwd || charge.amount;
  
  if (discountCodeId && basePrice > billingAmount) {
    try {
      const savedAmount = basePrice - billingAmount;
      
      // Create/update redemption record
      await supabase.from('discount_redemptions').upsert({
        discount_code_id: discountCodeId,
        subscription_id: subscriptionId,
        user_id: userId,
        cycle_number: 1,
        amount_before_kwd: basePrice,
        amount_after_kwd: billingAmount,
        cycles_applied: 1,
        total_saved_kwd: savedAmount,
        last_applied_at: now.toISOString(),
        status: 'active',
      }, { onConflict: 'discount_code_id,user_id,subscription_id' });

      // Update discount cycles used on subscription
      await supabase
        .from('subscriptions')
        .update({ 
          discount_cycles_used: 1,
          discount_code_id: discountCodeId, // Ensure it's set
        })
        .eq('id', subscriptionId);

      // Increment grant usage count using RPC
      await supabase.rpc('increment_grant_usage', {
        p_code_id: discountCodeId,
        p_user_id: userId,
      });

      console.log(JSON.stringify({ fn: "verify-payment", step: "discount_redeemed", requestId, chargeId, ok: true }));
    } catch (e) {
      console.log(JSON.stringify({ fn: "verify-payment", step: "discount_redemption_error", requestId, chargeId, ok: false }));
    }
  }

  // Send confirmation email (non-blocking)
  sendConfirmationEmail(supabase, requestId, userId, serviceId, nextBillingDate).catch(() => {});

  return { success: true, result: 'activated' };
}

/**
 * Handle failed payment status
 */
async function applyFailedPayment(
  supabase: any,
  requestId: string,
  params: {
    chargeId: string;
    charge: any;
    subscriptionId: string;
    userId: string;
  }
): Promise<{ success: boolean; result: string }> {
  const { chargeId, charge, subscriptionId } = params;
  const status = charge.status;

  console.log(JSON.stringify({ fn: "verify-payment", step: "apply_failed", requestId, chargeId, status }));

  await supabase
    .from('subscriptions')
    .update({
      tap_subscription_status: status,
      last_payment_status: status,
      payment_failed_at: new Date().toISOString(),
    })
    .eq('id', subscriptionId);

  await supabase
    .from('subscription_payments')
    .update({
      status: status === 'CANCELLED' ? 'cancelled' : 'failed',
      failed_at: new Date().toISOString(),
      failure_reason: charge.response?.message || status,
    })
    .eq('tap_charge_id', chargeId);

  return { success: true, result: 'failed' };
}

async function sendConfirmationEmail(
  supabase: any,
  requestId: string,
  userId: string,
  serviceId: string,
  nextBillingDate: Date
) {
  try {
    const { data: service } = await supabase
      .from('services')
      .select('name, type')
      .eq('id', serviceId)
      .single();

    const { data: profile } = await supabase
      .from('profiles_private')
      .select('email, full_name')
      .eq('profile_id', userId)
      .single();

    if (!profile?.email || !service?.name) return;

    const fullName = profile.full_name?.trim() || 'Valued Client';
    const isTeamPlan = service.type === 'team';

    const formattedRenewal = nextBillingDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const nextSteps = isTeamPlan
      ? '<strong>Access your team training plan</strong> in your dashboard<br><strong>Join our Discord community</strong> for team updates'
      : '<strong>Your coach will reach out</strong> with instructions within 24-48 hours<br><strong>Check your dashboard</strong> for program updates';

    const content = [
      greeting(fullName),
      alertBox(`<strong>Payment Confirmed!</strong><br>Your <strong>${service.name}</strong> subscription is now active.`, 'success'),
      detailCard('Subscription Details', [
        { label: 'Plan', value: service.name },
        { label: 'Renewal Date', value: formattedRenewal },
      ]),
      paragraph(`<strong>What's Next?</strong><br>${nextSteps}`),
      ctaButton('Go to Dashboard', `${APP_BASE_URL}/dashboard`),
      signOff(),
    ].join('');

    const html = wrapInLayout({
      content,
      preheader: `Your ${service.name} subscription is now active!`,
    });

    const result = await sendEmail({
      from: EMAIL_FROM_BILLING,
      to: profile.email,
      subject: `Welcome to ${service.name} -- Payment Confirmed!`,
      html,
    });

    if (!result.success) {
      console.log(JSON.stringify({ fn: "verify-payment", step: "confirmation_email_error", requestId, ok: false, error: result.error }));
      return;
    }

    console.log(JSON.stringify({ fn: "verify-payment", step: "confirmation_email_sent", requestId, ok: true }));
  } catch (error) {
    console.log(JSON.stringify({ fn: "verify-payment", step: "confirmation_email_error", requestId, ok: false }));
  }
}

/**
 * Verify charge with TAP API
 */
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
      const errorText = await response.text();
      return { success: false, error: `TAP API error: ${response.status} - ${errorText}` };
    }

    return { success: true, charge: await response.json() };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: `TAP API failed: ${msg}` };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  console.log(JSON.stringify({ fn: "verify-payment", step: "request_received", requestId }));

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tapSecretKey = Deno.env.get('TAP_SECRET_KEY');
    if (!tapSecretKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify the JWT resolves to a real user
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

    const body = await req.json();
    const { userId, chargeId: providedChargeId, source = 'client' } = body;

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify authenticated user matches the userId in the request
    if (user.id !== userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'User mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(JSON.stringify({ fn: "verify-payment", step: "authenticated", requestId, userId }));

    // Find charge ID
    let targetChargeId = providedChargeId;

    if (!targetChargeId) {
      const { data: latestPayment } = await supabase
        .from('subscription_payments')
        .select('tap_charge_id')
        .eq('user_id', userId)
        .eq('status', 'initiated')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      targetChargeId = latestPayment?.tap_charge_id;
    }

    if (!targetChargeId) {
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('tap_charge_id')
        .eq('user_id', userId)
        .not('tap_charge_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      targetChargeId = subscription?.tap_charge_id;
    }

    if (!targetChargeId) {
      return new Response(
        JSON.stringify({ success: true, status: 'no_payment', message: 'No pending payment' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting
    const rateCheck = checkChargeRateLimit(targetChargeId);
    if (!rateCheck.allowed) {
      console.log(JSON.stringify({ fn: "verify-payment", step: "rate_limited", requestId, ok: false }));
      
      const { exists, event } = await checkIdempotency(supabase, targetChargeId, 'CAPTURED');
      if (exists && event?.processed_at) {
        return new Response(
          JSON.stringify({ 
            success: true, 
            status: 'active', 
            subscriptionId: event.subscription_id,
            cached: true 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, status: 'throttled', message: 'Please wait' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get subscription
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('id, user_id, service_id, status, discount_code_id, base_price_kwd, billing_amount_kwd, past_due_since, tap_charge_id, last_verified_charge_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subscription) {
      return new Response(
        JSON.stringify({ success: true, status: 'no_subscription' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fast-path idempotency: already active with this charge
    if (subscription.status === 'active' && 
        subscription.last_verified_charge_id === targetChargeId && 
        !subscription.past_due_since) {
      console.log(JSON.stringify({ fn: "verify-payment", step: "already_active_fast_path", requestId, chargeId: targetChargeId, ok: true }));
      return new Response(
        JSON.stringify({ 
          success: true, 
          status: 'active', 
          subscriptionId: subscription.id,
          idempotent: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify with TAP API
    console.log(JSON.stringify({ fn: "verify-payment", step: "verifying_charge", requestId, chargeId: targetChargeId }));
    const verifyResult = await verifyChargeWithTap(targetChargeId, tapSecretKey);

    if (!verifyResult.success) {
      console.log(JSON.stringify({ fn: "verify-payment", step: "tap_verification_failed", requestId, chargeId: targetChargeId, ok: false }));
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to verify with payment provider' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const charge = verifyResult.charge;
    console.log(JSON.stringify({ fn: "verify-payment", step: "tap_status", requestId, chargeId: targetChargeId, status: charge.status }));

    // Check idempotency for this status
    const { exists: alreadyProcessed, event: existingEvent } = await checkIdempotency(
      supabase, targetChargeId, charge.status
    );

    if (alreadyProcessed && existingEvent?.processed_at && charge.status === 'CAPTURED') {
      console.log(JSON.stringify({ fn: "verify-payment", step: "already_processed", requestId, chargeId: targetChargeId, ok: true }));
      return new Response(
        JSON.stringify({ 
          success: true, 
          status: 'active', 
          subscriptionId: existingEvent.subscription_id || subscription.id,
          idempotent: true 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Record payment event
    await upsertPaymentEvent(supabase, {
      chargeId: targetChargeId,
      status: charge.status,
      verifiedJson: charge,
      userId,
      subscriptionId: subscription.id,
      amount: charge.amount,
      currency: charge.currency,
      source,
    });

    // Process based on status
    if (charge.status === 'CAPTURED') {
      const expectedAmount = subscription.billing_amount_kwd || subscription.base_price_kwd;

      const result = await applyCapturedPayment(supabase, requestId, {
        chargeId: targetChargeId,
        charge,
        subscriptionId: subscription.id,
        userId,
        serviceId: subscription.service_id,
        expectedAmount,
        subscription,
      });

      // Update payment event with result
      await upsertPaymentEvent(supabase, {
        chargeId: targetChargeId,
        status: charge.status,
        verifiedJson: charge,
        processedAt: new Date().toISOString(),
        processingResult: result.result,
        userId,
        subscriptionId: subscription.id,
        errorDetails: result.error,
        source,
      });

      if (result.result === 'activated' || result.result === 'already_active') {
        const nextBillingDate = new Date();
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

        return new Response(
          JSON.stringify({ 
            success: true, 
            status: 'active', 
            subscriptionId: subscription.id,
            nextBillingDate: nextBillingDate.toISOString(),
            message: 'Payment verified and subscription activated!' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      } else {
        return new Response(
          JSON.stringify({ success: false, error: result.error }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

    } else if (charge.status === 'INITIATED' || charge.status === 'IN_PROGRESS') {
      return new Response(
        JSON.stringify({ success: true, status: 'pending', message: 'Payment is being processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } else if (['FAILED', 'DECLINED', 'CANCELLED'].includes(charge.status)) {
      const result = await applyFailedPayment(supabase, requestId, {
        chargeId: targetChargeId,
        charge,
        subscriptionId: subscription.id,
        userId,
      });

      await upsertPaymentEvent(supabase, {
        chargeId: targetChargeId,
        status: charge.status,
        verifiedJson: charge,
        processedAt: new Date().toISOString(),
        processingResult: result.result,
        userId,
        subscriptionId: subscription.id,
        source,
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          status: 'failed', 
          tapStatus: charge.status,
          message: `Payment ${charge.status.toLowerCase()}. Please try again.` 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, status: subscription.status, tapStatus: charge.status }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.log(JSON.stringify({ fn: "verify-payment", step: "unhandled_error", requestId, ok: false }));
    return new Response(
      JSON.stringify({ success: false, error: 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
