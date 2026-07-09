import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Change-plan CP3 daily safety cron. Applies every scheduled change whose
// effective_at has passed (= the client's next_billing_date reached). Invoked by
// Vercel Cron via /api/cron?fn=process-plan-changes with the service role key.
// apply_subscription_change is idempotent (FOR UPDATE + status guard), so a race
// with a future verify-payment hook is harmless.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: due, error } = await supabase
      .from('subscription_change_requests')
      .select('id, user_id')
      .eq('status', 'scheduled')
      .lte('effective_at', new Date().toISOString());
    if (error) throw error;

    const results = { due: due?.length ?? 0, applied: 0, waiting_for_payment: 0, needs_admin: 0, skipped: 0, errors: [] as string[] };

    for (const r of due ?? []) {
      // CP6: paid-only reconciliation. p_require_paid gates non-exempt applies to a
      // captured renewal (exempt bypasses). Unpaid due changes stay scheduled and
      // follow the existing past-due/dunning flow -- no free override.
      const { data, error: applyErr } = await supabase.rpc('apply_subscription_change', {
        p_request_id: r.id,
        p_reason: 'scheduled_plan_change_cron_reconcile',
        p_require_paid: true,
      });
      if (applyErr) {
        console.error(JSON.stringify({ fn: 'process-plan-changes', request_id: r.id, ok: false, msg: applyErr.message }));
        results.errors.push(r.id);
        continue;
      }
      if (data?.applied) results.applied++;
      else if (data?.reason === 'renewal_not_paid') results.waiting_for_payment++;
      else if (data?.reason === 'old_sub_not_active') results.needs_admin++;
      else results.skipped++;
    }

    console.log(JSON.stringify({ fn: 'process-plan-changes', ...results }));
    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(JSON.stringify({ fn: 'process-plan-changes', ok: false, message: error instanceof Error ? error.message : String(error) }));
    return new Response(JSON.stringify({ error: 'Plan-change processing failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
