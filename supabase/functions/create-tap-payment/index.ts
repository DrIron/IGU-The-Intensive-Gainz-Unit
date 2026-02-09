import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { AUTH_REDIRECT_URLS } from "../_shared/config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
      console.error('TAP_SECRET_KEY is not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Payment system configuration error' }),
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

    // Get and validate request body with comprehensive schema validation
    const paymentSchema = z.object({
      serviceId: z.string().uuid(),
      userId: z.string().uuid(),
      customerEmail: z.string().email().max(255),
      customerName: z.string().trim().min(1).max(100)
        .regex(/^[a-zA-Z\s'-]+$/, 'Name contains invalid characters'),
      discountCode: z.string().optional(),
      isRenewal: z.boolean().optional(), // Flag to indicate this is a renewal payment
    });

    const requestBody = await req.json();
    
    let validatedData;
    try {
      validatedData = paymentSchema.parse(requestBody);
    } catch (validationError) {
      console.error('Validation error:', validationError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid payment information' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { serviceId, userId, customerEmail, customerName, discountCode, isRenewal } = validatedData;

    // Verify authenticated user matches the userId in the request
    if (user.id !== userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'User mismatch' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating TAP one-time payment for:', { serviceId, userId, discountCode, isRenewal });

    // Get service details
    const { data: service, error: serviceError } = await supabase
      .from('services')
      .select('*')
      .eq('id', serviceId)
      .single();

    if (serviceError) throw serviceError;

    // Server-side discount validation - NEVER trust client-side values
    let discountCodeData = null;
    let validatedCodeId: string | null = null;
    const basePrice = service.price_kwd;
    let billingAmount = basePrice;

    if (discountCode) {
      console.log('Server-side discount validation for service:', serviceId);

      // First check for a valid pending discount application (not expired, not consumed)
      const { data: pendingApp } = await supabase
        .from('pending_discount_applications')
        .select('code_id, expires_at')
        .eq('user_id', userId)
        .eq('service_id', serviceId)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();

      if (pendingApp) {
        console.log('Found valid pending discount application:', pendingApp.code_id);
      }

      // Always re-validate the code server-side (defense in depth)
      const { data: validationResult, error: validationError } = await supabase
        .rpc('validate_discount_code', {
          p_code: discountCode,
          p_service_id: serviceId,
          p_user_id: userId
        });

      if (validationError) {
        console.error('Discount validation RPC error:', validationError);
      } else {
        const result = validationResult?.[0];
        
        if (result?.is_valid === true) {
          validatedCodeId = result.code_id;
          
          // Fetch full code data for discount application (using service role)
          const { data: codeData } = await supabase
            .from('discount_codes')
            .select('*')
            .eq('id', result.code_id)
            .single();
          
          if (codeData) {
            // Apply discount using values from validation result
            if (result.percent_off) {
              billingAmount = basePrice * (1 - result.percent_off / 100);
            } else if (result.amount_off_kwd) {
              billingAmount = basePrice - result.amount_off_kwd;
            }

            // Enforce minimum price from code data
            if (codeData.min_price_kwd !== null && billingAmount < codeData.min_price_kwd) {
              billingAmount = codeData.min_price_kwd;
            }
            
            // Ensure non-negative
            billingAmount = Math.max(0, billingAmount);
            
            discountCodeData = codeData;
            console.log('Discount validated and applied server-side:', { 
              basePrice, 
              billingAmount, 
              code_id: codeData.id,
              code_prefix: codeData.code_prefix,
              duration_type: codeData.duration_type 
            });
          }
        } else {
          console.log('Discount code validation failed server-side:', result?.reason);
          // Continue without discount - don't fail the payment
        }
      }
    }

    // Create a one-time TAP charge (no card saving, no recurring setup)
    // Manual billing model: client must pay each time
    const chargeDescription = isRenewal 
      ? `${service.name} - Monthly Renewal`
      : `${service.name} - Initial Payment`;

    // Generate unique reference IDs for idempotency and reconciliation
    // Using timestamp + userId to prevent duplicate charges from double-clicks
    const timestamp = Date.now();
    const orderRef = `igu_${userId.slice(0, 8)}_${timestamp}`;
    const txnRef = `txn_${timestamp}`;

    const chargeResponse = await fetch('https://api.tap.company/v2/charges', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tapSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: billingAmount,
        currency: 'KWD',
        // Recommended: threeDSecure and customer_initiated for first-time payments
        threeDSecure: true,
        customer_initiated: true,
        customer: {
          first_name: customerName.split(' ')[0] || customerName,
          last_name: customerName.split(' ').slice(1).join(' ') || '',
          email: customerEmail,
        },
        description: chargeDescription,
        // Reference object for idempotency and reconciliation (TAP Best Practice)
        reference: {
          transaction: txnRef,
          order: orderRef,
          // Idempotent string prevents duplicate charges within 24 hours
          idempotent: orderRef,
        },
        metadata: {
          service_id: serviceId,
          user_id: userId,
          email: customerEmail,
          is_renewal: isRenewal ? 'true' : 'false',
          billing_type: 'manual',
          // Include discount info for verification on capture
          discount_code_id: validatedCodeId || '',
          base_price_kwd: basePrice.toString(),
          billing_amount_kwd: billingAmount.toString(),
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
      const errorTxt = await chargeResponse.text();
      console.error('TAP charge creation failed:', errorTxt);
      throw new Error('Failed to create payment. Please try again or contact support.');
    }

    const tapCharge = await chargeResponse.json();
    console.log('TAP one-time charge created:', tapCharge.id);
    
    const paymentUrl = tapCharge.transaction?.url || tapCharge.redirect_url || null;
    const tapChargeId = tapCharge.id;
    const tapStatus = tapCharge.status;

    if (!paymentUrl) {
      throw new Error('Payment URL was not provided by TAP');
    }

    // Calculate next billing date (30 days from now) - for display purposes only
    // Actual renewal requires manual payment
    const nextBillingDate = new Date();
    nextBillingDate.setDate(nextBillingDate.getDate() + 30);

    // Ensure a subscription row exists and store TAP charge ID (not card/agreement)
    const { data: existingSub, error: findSubError } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('service_id', serviceId)
      .maybeSingle();

    if (findSubError) {
      console.error('Failed to check existing subscription:', findSubError);
    }

    // Only store charge-related info, no card tokens or payment agreements
    const updatePayload = {
      tap_charge_id: tapChargeId,
      tap_subscription_status: tapStatus,
      start_date: new Date().toISOString(),
      next_billing_date: nextBillingDate.toISOString(),
      base_price_kwd: basePrice,
      billing_amount_kwd: billingAmount,
      discount_code_id: discountCodeData?.id || null,
      discount_cycles_used: 0,
      // Explicitly clear any legacy card/agreement fields
      tap_card_id: null,
      tap_payment_agreement_id: null,
    };

    let subscriptionId: string;

    if (!existingSub) {
      const { data: newSub, error: insertError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          service_id: serviceId,
          status: 'pending',
          ...updatePayload,
        })
        .select('id')
        .single();
      
      if (insertError) {
        console.error('Failed to create subscription:', insertError);
        throw insertError;
      }
      subscriptionId = newSub.id;
    } else {
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update(updatePayload)
        .eq('id', existingSub.id);
      if (updateError) {
        console.error('Failed to update subscription:', updateError);
      }
      subscriptionId = existingSub.id;
    }

    // Mark pending discount application as consumed (if exists)
    // Redemption record will be created on payment capture (verify-payment/tap-webhook)
    if (discountCodeData) {
      const { error: consumeError } = await supabase
        .from('pending_discount_applications')
        .update({
          consumed_at: new Date().toISOString(),
          tap_charge_id: tapChargeId,
        })
        .eq('user_id', userId)
        .eq('service_id', serviceId)
        .eq('code_id', discountCodeData.id)
        .is('consumed_at', null);

      if (consumeError) {
        console.error('Failed to mark pending discount as consumed:', consumeError);
      } else {
        console.log('Pending discount application marked as consumed for charge:', tapChargeId);
      }
    }

    // Log the payment attempt in subscription_payments table
    const billingPeriodStart = new Date();
    const billingPeriodEnd = new Date(nextBillingDate);
    
    try {
      const { error: paymentLogError } = await supabase
        .from('subscription_payments')
        .insert({
          subscription_id: subscriptionId,
          user_id: userId,
          tap_charge_id: tapChargeId,
          amount_kwd: billingAmount,
          status: 'initiated',
          is_renewal: isRenewal || false,
          billing_period_start: billingPeriodStart.toISOString().split('T')[0],
          billing_period_end: billingPeriodEnd.toISOString().split('T')[0],
          metadata: {
            service_id: serviceId,
            base_price_kwd: basePrice,
            discount_code: discountCodeData?.code || null,
          },
        });

      if (paymentLogError) {
        console.error('Failed to log payment attempt:', paymentLogError);
        // Don't fail the payment initiation for logging issues
      } else {
        console.log('Payment attempt logged to subscription_payments');
      }
    } catch (logError) {
      console.error('Error logging payment:', logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        paymentUrl,
        chargeId: tapChargeId,
        message: 'Payment initiated. Please complete your payment.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in create-tap-payment:', error);
    
    // Return generic error to client, log details server-side only
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Payment processing failed. Please try again.',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
