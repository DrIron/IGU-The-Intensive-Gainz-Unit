// book-session edge function
//
// Thin wrapper around the SECURITY DEFINER RPC book_session_atomic
// (migration 20260524120000). The RPC validates profile + subscription +
// slot + weekly limit and inserts the booking inside one transaction with
// the slot row locked FOR UPDATE.
//
// Closes audit findings B6-N1 (race), B6-N2 (silent slot update), B6-N8
// (missing get_current_week_bounds + UTC fallback), B6-N12 (dead services
// join). The whole read-then-write block that used to live here is now in
// the RPC.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map RPC SQLSTATE → HTTP status code. RPC raises with USING ERRCODE so
// PostgREST surfaces the code in error.code.
function httpStatusForPgCode(code: string | undefined): number {
  switch (code) {
    case 'NTFND': return 404; // profile / slot not found
    case '42501': return 403; // forbidden (account not active, no subscription)
    case '22023': return 400; // invalid (in the past, limit reached, limit not configured)
    case '40001': return 400; // slot no longer available
    default:      return 500;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error('[book-session] Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate caller — service-role bypasses RLS but the RPC needs the
    // user's id to validate ownership. We get that from the JWT.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      console.error('[book-session] Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.user.id;

    // Rate limit: 20 requests/min per user.
    const rateCheck = checkRateLimit(`user:${userId}`, 20, 60_000);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
    }

    // Parse body.
    let body: { slot_id?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const slotId = body?.slot_id;
    if (!slotId) {
      return new Response(
        JSON.stringify({ error: 'slot_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Service-role client to invoke the SECURITY DEFINER RPC.
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      'book_session_atomic',
      { p_slot_id: slotId, p_user_id: userId }
    );

    if (rpcError) {
      // RPC raises with structured ERRCODE — map to HTTP status. The user-
      // facing message comes from the RPC's RAISE EXCEPTION literal.
      const status = httpStatusForPgCode(rpcError.code);
      console.error(
        `[book-session] RPC error (HTTP ${status}, PG ${rpcError.code}):`,
        rpcError.message
      );
      return new Response(
        JSON.stringify({ error: rpcError.message }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(
      `[book-session] Booking created: ${rpcResult?.booking_id} for user ${userId}`
    );

    return new Response(
      JSON.stringify(rpcResult),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[book-session] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
