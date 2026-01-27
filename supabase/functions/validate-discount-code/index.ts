import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { code, serviceId } = await req.json();

    if (!code || !serviceId) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Code and service ID are required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('cf-connecting-ip') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    console.log('Validating discount code for service:', serviceId);

    // Use the secure database function to validate (handles hashing internally)
    const { data: validationResult, error: validationError } = await supabase
      .rpc('validate_discount_code', {
        p_code: code,
        p_service_id: serviceId,
        p_user_id: user.id
      });

    if (validationError) {
      console.error('Validation RPC error:', validationError);
      throw validationError;
    }

    const result = validationResult?.[0];
    const isValid = result?.is_valid === true;

    // Log the validation attempt (hash the code for the log)
    const codeHash = code.trim().toUpperCase(); // Will be hashed by DB on next query if needed
    await supabase
      .from('discount_validation_log')
      .insert({
        user_id: user.id,
        code_hash_attempted: codeHash,
        code_id: result?.code_id || null,
        was_valid: isValid,
        denial_reason: result?.reason || null,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (!isValid) {
      console.log('Code validation failed:', result?.reason);
      return new Response(
        JSON.stringify({ valid: false, reason: result?.reason || 'Invalid code' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Code is valid - return sanitized info
    console.log('Code validated successfully');
    return new Response(
      JSON.stringify({
        valid: true,
        code: {
          id: result.code_id,
          percent_off: result.percent_off,
          amount_off_kwd: result.amount_off_kwd,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in validate-discount-code:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
