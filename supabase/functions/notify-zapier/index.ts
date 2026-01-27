import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ZapierEventPayload type definition
// NOTE: coach_email has been deliberately removed to prevent PII exposure to external services
interface ZapierEventPayload {
  event_type: string;
  occurred_at?: string;
  user_id?: string | null;
  profile_id?: string | null;
  profile_email?: string | null;
  profile_status?: string | null;
  subscription_id?: string | null;
  subscription_status?: string | null;
  service_id?: string | null;
  service_name?: string | null;
  coach_id?: string | null;
  // coach_email removed - PII should not be sent to external services
  amount_kwd?: number | null;
  tap_charge_id?: string | null;
  tap_customer_id?: string | null;
  tap_subscription_status?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ZapierEventPayload = await req.json();

    // Validate event_type
    if (!body.event_type || typeof body.event_type !== 'string' || body.event_type.trim() === '') {
      console.error('[notify-zapier] Invalid event_type:', body.event_type);
      return new Response(
        JSON.stringify({ success: false, error: 'event_type must be a non-empty string' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const zapierWebhookUrl = Deno.env.get('ZAPIER_WEBHOOK_URL_CORE');

    // If no webhook URL configured, log error and return 500
    if (!zapierWebhookUrl) {
      console.error('[notify-zapier] ZAPIER_WEBHOOK_URL_CORE not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'ZAPIER_WEBHOOK_URL_CORE not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auto-fill occurred_at if not provided
    const occurred_at = body.occurred_at || new Date().toISOString();

    // Build the Zapier payload - deliberately excluding coach email/PII
    const zapierPayload = {
      event_type: body.event_type,
      occurred_at,
      user_id: body.user_id ?? null,
      profile_id: body.profile_id ?? null,
      profile_email: body.profile_email ?? null,
      profile_status: body.profile_status ?? null,
      subscription_id: body.subscription_id ?? null,
      subscription_status: body.subscription_status ?? null,
      service_id: body.service_id ?? null,
      service_name: body.service_name ?? null,
      coach_id: body.coach_id ?? null,
      // coach_email deliberately excluded - use coach_id for lookups
      amount_kwd: body.amount_kwd ?? null,
      tap_charge_id: body.tap_charge_id ?? null,
      tap_customer_id: body.tap_customer_id ?? null,
      tap_subscription_status: body.tap_subscription_status ?? null,
      notes: body.notes ?? null,
      metadata: body.metadata ?? null,
    };

    console.log(`[notify-zapier] Sending event: ${body.event_type}`);

    try {
      const response = await fetch(zapierWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(zapierPayload),
      });

      if (!response.ok) {
        const responseText = await response.text();
        console.error(`[notify-zapier] Zapier responded with ${response.status}: ${responseText}`);
        // Return ok: false but don't throw - never break calling business logic
        return new Response(
          JSON.stringify({ success: true, ok: false, zapier_status: response.status }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[notify-zapier] Successfully sent event: ${body.event_type}`);
      return new Response(
        JSON.stringify({ success: true, ok: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (fetchError) {
      console.error('[notify-zapier] Failed to call Zapier webhook:', fetchError);
      // Return ok: false but don't throw - never break calling business logic
      return new Response(
        JSON.stringify({ success: true, ok: false, zapier_error: 'fetch_failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('[notify-zapier] Error processing request:', error);
    return new Response(
      JSON.stringify({ success: false, ok: false, error: 'Invalid request body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
