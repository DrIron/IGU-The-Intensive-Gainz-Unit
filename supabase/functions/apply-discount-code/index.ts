import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting: 10 requests per minute per IP
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp, 10, 60_000);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse and validate input
    const body = await req.json();
    const { code, service_id } = body;

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Discount code is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!service_id || typeof service_id !== 'string') {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Service ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get IP and user agent for logging
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    console.log(`Validating discount code for user ${user.id}, service ${service_id}`);

    // Call the secure database function
    const { data: validationResult, error: validationError } = await supabase
      .rpc('validate_discount_code', {
        p_code: code.trim(),
        p_service_id: service_id,
        p_user_id: user.id
      });

    if (validationError) {
      console.error('Validation RPC error:', validationError);
      throw validationError;
    }

    const result = validationResult?.[0];
    const isValid = result?.is_valid === true;

    // Log the attempt
    await supabase
      .from('discount_validation_log')
      .insert({
        user_id: user.id,
        code_hash_attempted: code.trim().toUpperCase(), // Just for pattern, actual hash in DB
        code_id: result?.code_id || null,
        was_valid: isValid,
        denial_reason: isValid ? null : (result?.reason || 'Unknown'),
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (!isValid) {
      console.log(`Invalid code attempt by user ${user.id}: ${result?.reason}`);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          reason: result?.reason || 'Invalid discount code' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create or update pending discount application (upsert to handle re-applications)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes
    
    const { error: pendingError } = await supabase
      .from('pending_discount_applications')
      .upsert({
        user_id: user.id,
        code_id: result.code_id,
        service_id: service_id,
        expires_at: expiresAt,
        consumed_at: null,
        tap_charge_id: null,
      }, {
        onConflict: 'user_id,service_id',
      });

    if (pendingError) {
      console.error('Failed to create pending discount application:', pendingError);
      // Don't fail the request, but log it - payment creation will re-validate anyway
    } else {
      console.log(`Pending discount application created for user ${user.id}, code_id ${result.code_id}, expires ${expiresAt}`);
    }

    // Success - return discount details
    console.log(`Discount code validated for user ${user.id}, code_id ${result.code_id}`);
    return new Response(
      JSON.stringify({
        valid: true,
        code_id: result.code_id,
        discount: {
          percent_off: result.percent_off,
          amount_off_kwd: result.amount_off_kwd,
        },
        expires_at: expiresAt,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in apply-discount-code:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
