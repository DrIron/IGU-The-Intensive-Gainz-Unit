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
      console.error('[book-session] Missing Supabase configuration');
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
      console.error('[book-session] Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.user.id;

    // Rate limiting: 20 requests per minute per user
    const rateCheck = checkRateLimit(`user:${userId}`, 20, 60_000);
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
      .select('id, email, status, payment_exempt, first_name, last_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error('[book-session] Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'Profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate profile status
    const isAllowed = profile.status === 'active' || profile.payment_exempt === true;
    if (!isAllowed) {
      return new Response(
        JSON.stringify({ error: 'Your account must be active to book sessions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find active subscription with session booking enabled
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        id,
        user_id,
        service_id,
        coach_id,
        status,
        session_booking_enabled,
        weekly_session_limit,
        session_duration_minutes,
        services!inner (
          id,
          name,
          type
        )
      `)
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .eq('session_booking_enabled', true)
      .maybeSingle();

    if (subError) {
      console.error('[book-session] Subscription query error:', subError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subscription) {
      return new Response(
        JSON.stringify({ error: 'No active subscription with session booking enabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json();
    const { slot_id } = body;

    if (!slot_id) {
      return new Response(
        JSON.stringify({ error: 'slot_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch and validate slot
    const { data: slot, error: slotError } = await supabaseAdmin
      .from('coach_time_slots')
      .select('id, coach_id, slot_start, slot_end, location, slot_type, status')
      .eq('id', slot_id)
      .single();

    if (slotError || !slot) {
      console.error('[book-session] Slot not found:', slotError);
      return new Response(
        JSON.stringify({ error: 'Slot not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate slot availability
    const now = new Date();
    const slotStart = new Date(slot.slot_start);

    if (slot.status !== 'available') {
      return new Response(
        JSON.stringify({ error: 'Slot is not available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (slotStart <= now) {
      return new Response(
        JSON.stringify({ error: 'Cannot book a slot in the past' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Weekly limit check
    if (subscription.weekly_session_limit === null) {
      return new Response(
        JSON.stringify({ error: 'Session booking limit not configured for your subscription' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate week boundaries using database time for consistency
    const { data: weekBounds, error: weekError } = await supabaseAdmin.rpc('get_current_week_bounds');
    
    let weekStart: string;
    let weekEnd: string;
    
    if (weekError || !weekBounds) {
      // Fallback to JS calculation if RPC doesn't exist
      const nowDate = new Date();
      const dayOfWeek = nowDate.getUTCDay();
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(nowDate);
      monday.setUTCDate(nowDate.getUTCDate() + diffToMonday);
      monday.setUTCHours(0, 0, 0, 0);
      
      const nextMonday = new Date(monday);
      nextMonday.setUTCDate(monday.getUTCDate() + 7);
      
      weekStart = monday.toISOString();
      weekEnd = nextMonday.toISOString();
    } else {
      weekStart = weekBounds.week_start;
      weekEnd = weekBounds.week_end;
    }

    // Count existing bookings this week
    const { count: bookingCount, error: countError } = await supabaseAdmin
      .from('session_bookings')
      .select('id', { count: 'exact', head: true })
      .eq('subscription_id', subscription.id)
      .in('status', ['booked', 'completed'])
      .gte('session_start', weekStart)
      .lt('session_start', weekEnd);

    if (countError) {
      console.error('[book-session] Count error:', countError);
      return new Response(
        JSON.stringify({ error: 'Failed to check weekly limit' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const currentCount = bookingCount ?? 0;
    if (currentCount >= subscription.weekly_session_limit) {
      return new Response(
        JSON.stringify({ 
          error: 'Weekly session limit reached',
          current: currentCount,
          limit: subscription.weekly_session_limit
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Re-check slot availability before booking (optimistic locking)
    const { data: slotRecheck, error: recheckError } = await supabaseAdmin
      .from('coach_time_slots')
      .select('id, status, slot_start')
      .eq('id', slot_id)
      .eq('status', 'available')
      .gt('slot_start', new Date().toISOString())
      .single();

    if (recheckError || !slotRecheck) {
      return new Response(
        JSON.stringify({ error: 'Slot is no longer available' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create booking
    const { data: booking, error: bookingError } = await supabaseAdmin
      .from('session_bookings')
      .insert({
        slot_id: slot.id,
        subscription_id: subscription.id,
        client_id: profile.id,
        coach_id: slot.coach_id,
        session_type: slot.slot_type,
        session_start: slot.slot_start,
        session_end: slot.slot_end,
        status: 'booked',
        created_by: profile.id,
      })
      .select('id')
      .single();

    if (bookingError) {
      console.error('[book-session] Booking insert error:', bookingError);
      return new Response(
        JSON.stringify({ error: 'Failed to create booking' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update slot status to booked
    const { error: slotUpdateError } = await supabaseAdmin
      .from('coach_time_slots')
      .update({ status: 'booked' })
      .eq('id', slot.id);

    if (slotUpdateError) {
      console.error('[book-session] Slot update error:', slotUpdateError);
      // Booking was created, but slot update failed - log but don't fail
    }

    // Emit Zapier event (non-blocking)
    try {
      const service = (subscription as unknown as { services: { id: string; name: string; type: string } }).services;
      
      await supabaseAdmin.functions.invoke('notify-zapier', {
        body: {
          event_type: 'session_booked',
          user_id: profile.id,
          profile_id: profile.id,
          profile_email: profile.email,
          profile_status: profile.status,
          subscription_id: subscription.id,
          subscription_status: subscription.status,
          service_id: service.id,
          service_name: service.name,
          coach_id: slot.coach_id,
          notes: 'Session booked',
          metadata: {
            session_id: booking.id,
            slot_id: slot.id,
            session_start: slot.slot_start,
            session_end: slot.slot_end,
            location: slot.location,
            session_type: slot.slot_type,
          },
        },
      });
      console.log('[book-session] Zapier notification sent');
    } catch (zapierError) {
      console.error('[book-session] Zapier notification failed (non-critical):', zapierError);
    }

    console.log(`[book-session] Booking created: ${booking.id} for user ${profile.id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        booking_id: booking.id, 
        slot_id: slot.id 
      }),
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
