import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error('[cancel-session] Missing Supabase configuration');
      return new Response(
        JSON.stringify({ error: 'Configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !claimsData?.user) {
      console.error('[cancel-session] Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.user.id;

    // Rate limiting: 10 requests per minute per user
    const rateCheck = checkRateLimit(`user:${userId}`, 10, 60_000);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
    }

    // Service role client for privileged operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Fetch profile
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, status, first_name, last_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('[cancel-session] Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: adminRole } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    const isAdmin = !!adminRole;

    // Parse request body
    const body = await req.json();
    const { booking_id } = body;

    if (!booking_id) {
      return new Response(
        JSON.stringify({ error: 'booking_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch booking with slot and subscription info
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('session_bookings')
      .select(`
        id,
        slot_id,
        subscription_id,
        client_id,
        coach_id,
        session_type,
        session_start,
        session_end,
        status,
        coach_time_slots!inner (
          id,
          status,
          location
        ),
        subscriptions!inner (
          id,
          status,
          service_id,
          services!inner (
            id,
            name
          )
        )
      `)
      .eq('id', booking_id)
      .single();

    if (bookingError || !booking) {
      console.error('[cancel-session] Booking not found:', bookingError);
      return new Response(
        JSON.stringify({ error: 'Booking not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization check
    const isClient = booking.client_id === profile.id;
    const isCoach = booking.coach_id === profile.id;

    if (!isClient && !isCoach && !isAdmin) {
      return new Response(
        JSON.stringify({ error: 'You are not authorized to cancel this booking' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate booking can be cancelled
    if (booking.status !== 'booked') {
      return new Response(
        JSON.stringify({ error: `Cannot cancel booking with status: ${booking.status}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sessionStart = new Date(booking.session_start);
    const now = new Date();

    if (sessionStart <= now) {
      return new Response(
        JSON.stringify({ error: 'Cannot cancel a session that has already started or passed' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine cancellation status and who cancelled
    let newStatus: string;
    let cancelledBy: string;

    if (isClient && !isCoach && !isAdmin) {
      newStatus = 'cancelled_by_client';
      cancelledBy = 'client';
    } else if (isCoach || isAdmin) {
      newStatus = 'cancelled_by_coach';
      cancelledBy = isAdmin ? 'admin' : 'coach';
    } else {
      newStatus = 'cancelled_by_client';
      cancelledBy = 'client';
    }

    // Update booking status
    const { error: updateBookingError } = await supabaseAdmin
      .from('session_bookings')
      .update({ status: newStatus })
      .eq('id', booking.id);

    if (updateBookingError) {
      console.error('[cancel-session] Booking update error:', updateBookingError);
      return new Response(
        JSON.stringify({ error: 'Failed to cancel booking' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Release the slot back to available
    const { error: slotUpdateError } = await supabaseAdmin
      .from('coach_time_slots')
      .update({ status: 'available' })
      .eq('id', booking.slot_id);

    if (slotUpdateError) {
      console.error('[cancel-session] Slot update error:', slotUpdateError);
      // Non-critical - booking is cancelled but slot may not be released
    }

    // Authoritative post-cancel weekly usage (B6-N5). Mirrors
    // book_session_atomic: Kuwait-anchored week bounds (get_current_week_bounds)
    // + COUNT of bookings still occupying the quota (status IN booked|completed).
    // The cancellation above already flipped this booking to cancelled_by_*,
    // dropping it from the count — i.e. the weekly credit is restored by the
    // derived count, there is no stored counter to reverse. Returning the exact
    // number lets ClientSessions sync precisely instead of guessing via an
    // optimistic decrement that diverges from the server on the Kuwait week
    // boundary.
    let weeklyUsed: number | null = null;
    let weeklyRemaining: number | null = null;
    let weekStartUtc: string | null = null;
    let weekEndUtc: string | null = null;

    const { data: bounds, error: boundsError } = await supabaseAdmin.rpc(
      'get_current_week_bounds'
    );
    if (boundsError || !bounds) {
      console.error('[cancel-session] Week bounds lookup failed:', boundsError);
    } else {
      weekStartUtc = bounds.week_start ?? null;
      weekEndUtc = bounds.week_end ?? null;

      const { count, error: countError } = await supabaseAdmin
        .from('session_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_id', booking.subscription_id)
        .in('status', ['booked', 'completed'])
        .gte('session_start', weekStartUtc as string)
        .lt('session_start', weekEndUtc as string);

      if (countError) {
        console.error('[cancel-session] Weekly count failed:', countError);
      } else {
        weeklyUsed = count ?? 0;

        // Direct lookup (not the embedded join) — PostgREST to-one embeds are
        // shape-ambiguous and CLAUDE.md flags subscription FK joins as unreliable.
        const { data: subRow } = await supabaseAdmin
          .from('subscriptions')
          .select('weekly_session_limit')
          .eq('id', booking.subscription_id)
          .maybeSingle();

        const limit = subRow?.weekly_session_limit ?? null;
        weeklyRemaining = limit !== null ? Math.max(limit - weeklyUsed, 0) : null;
      }
    }

    console.log(`[cancel-session] Booking ${booking.id} cancelled by ${cancelledBy}`);

    return new Response(
      JSON.stringify({
        success: true,
        weeklyUsed,
        weeklyRemaining,
        weekStartUtc,
        weekEndUtc,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[cancel-session] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
