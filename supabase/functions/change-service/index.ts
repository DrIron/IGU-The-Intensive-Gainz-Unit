import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

// change-service (change-plan flow). Deployed --no-verify-jwt; does its own auth
// (mirrors submit-onboarding: anon client for getUser, service-role for writes).
// CP2 ships the `schedule` action for 1:1<->1:1 only. `apply` lands in CP3.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error(JSON.stringify({ fn: 'change-service', step: 'config', ok: false }));
      return json({ error: 'Configuration error' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    // Internal auth: resolve the caller from their JWT.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'Unauthorized' }, 401);

    // Service-role client for reads/writes (bypasses RLS; we gate on ownership).
    const admin = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === 'apply') {
      // Admin/internal single apply (the process-plan-changes cron applies via the
      // RPC directly; this is for admin manual + future verify-payment reuse).
      // apply_subscription_change is idempotent. Admin only.
      const requestId = body?.requestId;
      if (!requestId) return json({ error: 'Missing requestId' }, 400);
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
      if (!roles?.some((r) => r.role === 'admin')) return json({ error: 'Admin only' }, 403);
      const { data, error } = await admin.rpc('apply_subscription_change', {
        p_request_id: requestId,
        p_reason: 'manual_admin_apply',
      });
      if (error) {
        console.error(JSON.stringify({ fn: 'change-service', step: 'apply', ok: false, msg: error.message }));
        return json({ error: 'Apply failed' }, 500);
      }
      return json({ success: true, result: data });
    }

    if (action !== 'schedule') {
      return json({ error: 'Unsupported action' }, 400);
    }

    const targetServiceId: string | undefined = body?.targetServiceId;
    const coachPreference: string = ['auto', 'keep', 'specific'].includes(body?.coachPreference)
      ? body.coachPreference
      : 'auto';
    const requestedCoachIdIn: string | null = body?.requestedCoachId ?? null;
    const focusAreas: string[] = Array.isArray(body?.focusAreas) ? body.focusAreas : [];

    if (!targetServiceId) return json({ error: 'Missing target plan' }, 400);

    // Admin may schedule on behalf of a client; else the caller is the client.
    const onBehalfOf: string | undefined = body?.userId;
    let clientId = user.id;
    if (onBehalfOf && onBehalfOf !== user.id) {
      const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', user.id);
      if (!roles?.some((r) => r.role === 'admin')) {
        return json({ error: 'You can only change your own plan' }, 403);
      }
      clientId = onBehalfOf;
    }

    // 1) Current ACTIVE subscription (with service info).
    const { data: currentSub } = await admin
      .from('subscriptions')
      .select('id, user_id, service_id, coach_id, status, next_billing_date, coach_level_at_purchase, services(id, slug, type, name)')
      .eq('user_id', clientId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!currentSub) return json({ error: 'No active subscription to change' }, 400);

    // 2) Target service.
    const { data: targetService } = await admin
      .from('services')
      .select('id, slug, type, name')
      .eq('id', targetServiceId)
      .maybeSingle();
    if (!targetService) return json({ error: 'Target plan not found' }, 400);

    const currentType = (currentSub as any).services?.type;
    const currentName = (currentSub as any).services?.name;

    // 3) Scope (CP2 = 1:1 <-> 1:1). Team transitions land in CP4.
    if (currentType === 'team' || targetService.type === 'team') {
      return json({ error: 'Team plan changes are coming soon.', code: 'out_of_scope' }, 400);
    }
    if (targetService.id === currentSub.service_id) {
      return json({ error: "You're already on this plan.", code: 'no_op' }, 400);
    }

    // 4) One open change at a time (backstop for uq_scr_one_open).
    const { data: existing } = await admin
      .from('subscription_change_requests')
      .select('id, target_service_id, effective_at')
      .eq('user_id', clientId)
      .eq('status', 'scheduled')
      .maybeSingle();
    if (existing) {
      return json({ error: 'A plan change is already scheduled.', code: 'already_scheduled', existing }, 409);
    }

    // 5) Client's effective coach level (drives the target price) + exempt flag.
    let coachLevel = (currentSub as any).coach_level_at_purchase as string | null;
    if (!coachLevel && currentSub.coach_id) {
      const { data: cp } = await admin
        .from('coaches_public').select('coach_level').eq('user_id', currentSub.coach_id).maybeSingle();
      coachLevel = cp?.coach_level ?? null;
    }
    coachLevel = coachLevel ?? 'junior';

    const { data: pub } = await admin
      .from('profiles_public').select('payment_exempt').eq('id', clientId).maybeSingle();
    const isExempt = pub?.payment_exempt === true;

    // 6) Preview price + payout + min-profit guardrail for the target tier.
    const { data: preview, error: previewErr } = await admin.rpc('preview_subscription_change_payout', {
      p_target_service_id: targetServiceId,
      p_coach_level: coachLevel,
      p_discount_percentage: 0,
      p_payment_exempt: isExempt,
    });
    if (previewErr) {
      console.error(JSON.stringify({ fn: 'change-service', step: 'preview', ok: false, msg: previewErr.message }));
      return json({ error: 'Could not price this change' }, 500);
    }

    // 7) Guardrail -> needs_admin (graceful; never surface profit math to the client).
    const blocked = preview?.blocked === true;
    const status = blocked ? 'needs_admin' : 'scheduled';
    const blockReason = blocked ? preview?.block_reason ?? 'guardrail' : null;

    // 8) effective_at = current next_billing_date; null/past -> now() (applies next payment).
    const nbd = currentSub.next_billing_date ? new Date(currentSub.next_billing_date) : null;
    const now = new Date();
    const appliesAtNextPayment = !nbd || nbd <= now;
    const effectiveAt = appliesAtNextPayment ? now.toISOString() : nbd!.toISOString();

    // 9) Write the request (current sub untouched). 'keep' snapshots the current coach.
    const requestedCoachId =
      coachPreference === 'keep' ? currentSub.coach_id
      : coachPreference === 'specific' ? requestedCoachIdIn
      : null;

    const { data: inserted, error: insErr } = await admin
      .from('subscription_change_requests')
      .insert({
        user_id: clientId,
        current_subscription_id: currentSub.id,
        target_service_id: targetServiceId,
        target_team_id: null,
        coach_preference: coachPreference,
        requested_coach_id: requestedCoachId,
        focus_areas: focusAreas,
        target_price_kwd: isExempt ? null : preview?.client_price ?? null,
        effective_at: effectiveAt,
        status,
        block_reason: blockReason,
      })
      .select('id')
      .single();

    if (insErr) {
      // Unique-index race -> treat as already scheduled.
      if ((insErr as any).code === '23505') {
        return json({ error: 'A plan change is already scheduled.', code: 'already_scheduled' }, 409);
      }
      console.error(JSON.stringify({ fn: 'change-service', step: 'insert', ok: false, msg: insErr.message }));
      return json({ error: 'Could not schedule the change' }, 500);
    }

    console.log(JSON.stringify({
      fn: 'change-service', step: 'scheduled', ok: true,
      request_id: inserted.id, status, from: currentName, to: targetService.name,
    }));

    return json({
      success: true,
      status,
      requestId: inserted.id,
      fromServiceName: currentName,
      targetServiceName: targetService.name,
      targetPriceKwd: isExempt ? null : preview?.client_price ?? null,
      paymentExempt: isExempt,
      effectiveAt,
      appliesAtNextPayment,
      coachPreference,
    });
  } catch (error) {
    console.error(JSON.stringify({
      fn: 'change-service', step: 'unhandled', ok: false,
      message: error instanceof Error ? error.message : String(error),
    }));
    return json({ error: 'An error occurred while processing your request' }, 500);
  }
});
