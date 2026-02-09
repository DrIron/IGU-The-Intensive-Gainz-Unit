/**
 * Monthly Coach Payment Calculation Edge Function
 * 
 * This function calculates coach payouts based on the new pricing infrastructure:
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────────┐
 * │                         PAYOUT CALCULATION FORMULA                              │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │                                                                                  │
 * │  For each PRIMARY COACH assignment:                                              │
 * │  ───────────────────────────────────────────────────────────────────────────────│
 * │                                                                                  │
 * │  gross_revenue_kwd = service_pricing.price_kwd                                   │
 * │                                                                                  │
 * │  IF payout_rules.primary_payout_type = 'percent':                                │
 * │     coach_payout = gross_revenue_kwd × (payout_rules.primary_payout_value / 100) │
 * │  ELSE IF payout_rules.primary_payout_type = 'fixed':                             │
 * │     coach_payout = payout_rules.primary_payout_value                             │
 * │                                                                                  │
 * │  ⚠️ DISCOUNTS DO NOT REDUCE COACH PAYOUT                                         │
 * │     Coach is always paid based on GROSS price (list price)                       │
 * │                                                                                  │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │                                                                                  │
 * │  For each ADD-ON subscription:                                                   │
 * │  ───────────────────────────────────────────────────────────────────────────────│
 * │                                                                                  │
 * │  addon_gross = addon_pricing.price_kwd                                           │
 * │                                                                                  │
 * │  IF addon_payout_rules.payout_type = 'percent':                                  │
 * │     addon_payout = addon_gross × (addon_payout_rules.payout_value / 100)         │
 * │  ELSE IF addon_payout_rules.payout_type = 'fixed':                               │
 * │     addon_payout = addon_payout_rules.payout_value                               │
 * │                                                                                  │
 * │  Payout goes to: addon_payout_rules.payout_recipient_role                        │
 * │     - 'primary_coach' → credited to subscription's coach                         │
 * │     - 'addon_staff'   → credited to subscription_addons.staff_user_id            │
 * │                                                                                  │
 * ├─────────────────────────────────────────────────────────────────────────────────┤
 * │                                                                                  │
 * │  STORED METRICS (per coach, per month):                                          │
 * │  ───────────────────────────────────────────────────────────────────────────────│
 * │                                                                                  │
 * │  gross_revenue_kwd      = sum of all service list prices for coach's clients     │
 * │  discounts_applied_kwd  = sum of all discount_redemptions for those clients      │
 * │  net_collected_kwd      = gross_revenue_kwd - discounts_applied_kwd              │
 * │  total_payment          = coach_payout (from gross) + addon_payouts              │
 * │                                                                                  │
 * └─────────────────────────────────────────────────────────────────────────────────┘
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ServiceBreakdown {
  team: number;
  onetoone_inperson: number;
  onetoone_hybrid: number;
  onetoone_online: number;
}

interface PayoutRule {
  service_id: string;
  primary_payout_type: 'percent' | 'fixed';
  primary_payout_value: number;
  platform_fee_type: 'percent' | 'fixed' | 'none';
  platform_fee_value: number;
}

interface ServicePricing {
  service_id: string;
  price_kwd: number;
  is_active: boolean;
}

interface AddonPayoutRule {
  addon_id: string;
  payout_type: 'percent' | 'fixed';
  payout_value: number;
  payout_recipient_role: 'primary_coach' | 'addon_staff';
}

interface AddonPricing {
  id: string;
  code: string;
  price_kwd: number;
  is_active: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(JSON.stringify({ fn: "calc-coach-payments", step: "start", ok: true }));

    // Get the first day of the current month
    const now = new Date();
    const paymentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const paymentMonthStr = paymentMonth.toISOString().split('T')[0];
    
    // Get start and end of month for discount queries
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    console.log(JSON.stringify({ fn: "calc-coach-payments", step: "payment_month", month: paymentMonthStr }));

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Load pricing & payout rules from NEW tables
    // ═══════════════════════════════════════════════════════════════════════════

    // Load service pricing (replaces services.price_kwd)
    const { data: servicePricingData, error: pricingError } = await supabase
      .from('service_pricing')
      .select('service_id, price_kwd, is_active')
      .eq('is_active', true);

    if (pricingError) {
      console.error(JSON.stringify({ fn: "calc-coach-payments", step: "load_service_pricing", ok: false, error: "query_failed" }));
      throw new Error('Failed to load service pricing');
    }

    const servicePricingMap = new Map<string, number>(
      (servicePricingData || []).map((p: ServicePricing) => [p.service_id, Number(p.price_kwd)])
    );

    // Load payout rules (replaces coach_payment_rates)
    const { data: payoutRulesData, error: rulesError } = await supabase
      .from('payout_rules')
      .select('service_id, primary_payout_type, primary_payout_value, platform_fee_type, platform_fee_value');

    if (rulesError) {
      console.error(JSON.stringify({ fn: "calc-coach-payments", step: "load_payout_rules", ok: false, error: "query_failed" }));
      throw new Error('Failed to load payout rules');
    }

    const payoutRulesMap = new Map<string, PayoutRule>(
      (payoutRulesData || []).map((r: PayoutRule) => [r.service_id, r])
    );

    // Load addon pricing
    const { data: addonPricingData, error: addonPricingError } = await supabase
      .from('addon_pricing')
      .select('id, code, price_kwd, is_active')
      .eq('is_active', true);

    if (addonPricingError) {
      console.error(JSON.stringify({ fn: "calc-coach-payments", step: "load_addon_pricing", ok: false, error: "query_failed" }));
      throw new Error('Failed to load addon pricing');
    }

    const addonPricingMap = new Map<string, AddonPricing>(
      (addonPricingData || []).map((a: AddonPricing) => [a.id, a])
    );
    // Also map by code for legacy subscription_addons.specialty matching
    const addonPricingByCode = new Map<string, AddonPricing>(
      (addonPricingData || []).map((a: AddonPricing) => [a.code?.toLowerCase(), a])
    );

    // Load addon payout rules
    const { data: addonPayoutRulesData, error: addonRulesError } = await supabase
      .from('addon_payout_rules')
      .select('addon_id, payout_type, payout_value, payout_recipient_role');

    if (addonRulesError) {
      console.error(JSON.stringify({ fn: "calc-coach-payments", step: "load_addon_payout_rules", ok: false, error: "query_failed" }));
      throw new Error('Failed to load addon payout rules');
    }

    const addonPayoutRulesMap = new Map<string, AddonPayoutRule>(
      (addonPayoutRulesData || []).map((r: AddonPayoutRule) => [r.addon_id, r])
    );

    console.log(JSON.stringify({ fn: "calc-coach-payments", step: "data_loaded", ok: true, service_pricing: servicePricingMap.size, payout_rules: payoutRulesMap.size, addon_pricing: addonPricingMap.size, addon_payout_rules: addonPayoutRulesMap.size }));

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Load coaches
    // ═══════════════════════════════════════════════════════════════════════════

    const { data: coachRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'coach');

    const coachUserIds = coachRoles?.map(r => r.user_id) || [];

    if (coachUserIds.length === 0) {
      console.log(JSON.stringify({ fn: "calc-coach-payments", step: "no_coaches", ok: true }));
      return new Response(
        JSON.stringify({ success: true, message: 'No coaches to process' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: coachDetails, error: coachError } = await supabase
      .from('coaches')
      .select('id, user_id, first_name, last_name')
      .in('user_id', coachUserIds);

    if (coachError) throw coachError;

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Load services (for type categorization only)
    // ═══════════════════════════════════════════════════════════════════════════

    const { data: services } = await supabase
      .from('services')
      .select('id, type, name');

    const serviceMap = new Map(services?.map(s => [s.id, { type: s.type, name: s.name }]) || []);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Load active subscriptions
    // ═══════════════════════════════════════════════════════════════════════════

    const { data: subscriptions } = await supabase
      .from('subscriptions')
      .select('id, coach_id, service_id, user_id, profiles!inner(payment_exempt), discount_code_id')
      .eq('status', 'active');

    // Load discount redemptions for this month
    const { data: discountRedemptions } = await supabase
      .from('discount_redemptions')
      .select('subscription_id, total_saved_kwd, last_applied_at')
      .gte('last_applied_at', monthStart.toISOString())
      .lte('last_applied_at', monthEnd.toISOString());

    const subscriptionDiscounts = new Map<string, number>();
    discountRedemptions?.forEach(dr => {
      const current = subscriptionDiscounts.get(dr.subscription_id) || 0;
      subscriptionDiscounts.set(dr.subscription_id, current + (dr.total_saved_kwd || 0));
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Load subscription add-ons
    // ═══════════════════════════════════════════════════════════════════════════

    const { data: subscriptionAddons } = await supabase
      .from('subscription_addons')
      .select('id, subscription_id, staff_user_id, specialty, addon_id, price_kwd, payout_kwd, status')
      .eq('status', 'active')
      .eq('billing_type', 'recurring');

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 6: Calculate payouts using NEW formula
    // ═══════════════════════════════════════════════════════════════════════════

    // Track per-coach metrics
    const coachMetrics = new Map<string, {
      clientBreakdown: ServiceBreakdown;
      grossRevenue: number;
      discountsApplied: number;
      basePayout: number;
      addonPayout: number;
    }>();

    // Initialize all coaches
    for (const coach of coachDetails || []) {
      coachMetrics.set(coach.user_id, {
        clientBreakdown: { team: 0, onetoone_inperson: 0, onetoone_hybrid: 0, onetoone_online: 0 },
        grossRevenue: 0,
        discountsApplied: 0,
        basePayout: 0,
        addonPayout: 0,
      });
    }

    // Process each subscription
    subscriptions?.forEach(sub => {
      const isPaymentExempt = (sub.profiles as any)?.payment_exempt;
      if (!sub.coach_id || isPaymentExempt) return;

      const metrics = coachMetrics.get(sub.coach_id);
      if (!metrics) return;

      const service = serviceMap.get(sub.service_id);
      if (!service) return;

      // Get price from service_pricing (NEW TABLE)
      const grossPrice = servicePricingMap.get(sub.service_id) || 0;
      
      // Get payout rule from payout_rules (NEW TABLE)
      const payoutRule = payoutRulesMap.get(sub.service_id);

      // ════════════════════════════════════════════════════════════════════════
      // CORE FORMULA: Coach payout from GROSS price (discounts do NOT reduce it)
      // ════════════════════════════════════════════════════════════════════════
      let coachPayout = 0;
      if (payoutRule) {
        if (payoutRule.primary_payout_type === 'percent') {
          coachPayout = grossPrice * (Number(payoutRule.primary_payout_value) / 100);
        } else if (payoutRule.primary_payout_type === 'fixed') {
          coachPayout = Number(payoutRule.primary_payout_value);
        }
      } else {
        // Fallback: 70% if no rule defined
        coachPayout = grossPrice * 0.70;
        console.warn(JSON.stringify({ fn: "calc-coach-payments", step: "payout_rule_fallback", ok: false, service_id: sub.service_id }));
      }

      // Track gross revenue (list price before discounts)
      metrics.grossRevenue += grossPrice;
      
      // Track discounts applied (but they don't affect coach payout!)
      const subscriptionDiscount = subscriptionDiscounts.get(sub.id) || 0;
      metrics.discountsApplied += subscriptionDiscount;

      // Add to base payout
      metrics.basePayout += coachPayout;

      // Categorize by service type
      const serviceName = service.name?.toLowerCase() || '';
      if (service.type === 'team') {
        metrics.clientBreakdown.team++;
      } else if (service.type === 'one_to_one') {
        if (serviceName.includes('in-person') || serviceName.includes('inperson')) {
          metrics.clientBreakdown.onetoone_inperson++;
        } else if (serviceName.includes('hybrid')) {
          metrics.clientBreakdown.onetoone_hybrid++;
        } else {
          metrics.clientBreakdown.onetoone_online++;
        }
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 7: Process add-on payouts using addon_payout_rules
    // ═══════════════════════════════════════════════════════════════════════════

    subscriptionAddons?.forEach(addon => {
      // Find the subscription to get the coach
      const subscription = subscriptions?.find(s => s.id === addon.subscription_id);
      if (!subscription) return;

      // Determine addon pricing & payout rule
      let addonPricing: AddonPricing | undefined;
      let addonPayoutRule: AddonPayoutRule | undefined;

      if (addon.addon_id) {
        // New style: direct addon_id reference
        addonPricing = addonPricingMap.get(addon.addon_id);
        addonPayoutRule = addonPayoutRulesMap.get(addon.addon_id);
      } else if (addon.specialty) {
        // Legacy style: match by specialty code
        addonPricing = addonPricingByCode.get(addon.specialty?.toLowerCase());
        if (addonPricing) {
          addonPayoutRule = addonPayoutRulesMap.get(addonPricing.id);
        }
      }

      // Get addon gross price
      const addonGross = addonPricing ? Number(addonPricing.price_kwd) : Number(addon.price_kwd || 0);

      // Calculate addon payout
      let addonPayout = 0;
      if (addonPayoutRule) {
        if (addonPayoutRule.payout_type === 'percent') {
          addonPayout = addonGross * (Number(addonPayoutRule.payout_value) / 100);
        } else {
          addonPayout = Number(addonPayoutRule.payout_value);
        }
      } else {
        // Fallback: use legacy payout_kwd or 100% of price
        addonPayout = addon.payout_kwd ? Number(addon.payout_kwd) : addonGross;
      }

      // Determine recipient based on payout_recipient_role
      const recipientRole = addonPayoutRule?.payout_recipient_role || 'addon_staff';
      let recipientUserId: string | null = null;

      if (recipientRole === 'primary_coach') {
        // Payout goes to the subscription's assigned coach
        recipientUserId = subscription.coach_id;
      } else {
        // Payout goes to the addon staff member
        recipientUserId = addon.staff_user_id;
      }

      if (recipientUserId) {
        const metrics = coachMetrics.get(recipientUserId);
        if (metrics) {
          metrics.addonPayout += addonPayout;
          metrics.grossRevenue += addonGross;
        }
      }
    });

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 8: Build and upsert payment records
    // ═══════════════════════════════════════════════════════════════════════════

    const paymentRecords = [];
    let totalGrossRevenue = 0;
    let totalDiscountsApplied = 0;
    let totalCoachPayout = 0;

    for (const coach of coachDetails || []) {
      const metrics = coachMetrics.get(coach.user_id);
      if (!metrics) continue;

      const breakdown = metrics.clientBreakdown;
      const totalClients = breakdown.team + breakdown.onetoone_inperson + 
                          breakdown.onetoone_hybrid + breakdown.onetoone_online;

      const totalPayment = metrics.basePayout + metrics.addonPayout;
      const netCollected = metrics.grossRevenue - metrics.discountsApplied;

      totalGrossRevenue += metrics.grossRevenue;
      totalDiscountsApplied += metrics.discountsApplied;
      totalCoachPayout += totalPayment;

      paymentRecords.push({
        payment_month: paymentMonthStr,
        coach_id: coach.id,
        client_breakdown: {
          ...breakdown,
          addon_payout: metrics.addonPayout,
          addon_revenue: metrics.addonPayout, // For backward compat
        },
        // Store placeholder for backward compat - actual formula is now in payout_rules
        payment_rates: {
          formula: 'Uses payout_rules table',
          team: 0,
          onetoone_inperson: 0,
          onetoone_hybrid: 0,
          onetoone_online: 0,
        },
        total_clients: totalClients,
        total_payment: totalPayment,
        gross_revenue_kwd: metrics.grossRevenue,
        discounts_applied_kwd: metrics.discountsApplied,
        net_collected_kwd: netCollected,
      });

      console.log(JSON.stringify({ fn: "calc-coach-payments", step: "coach_payout", ok: true, coach_id: coach.id, clients: totalClients, gross_kwd: metrics.grossRevenue, discounts_kwd: metrics.discountsApplied, net_kwd: netCollected, base_payout_kwd: metrics.basePayout, addon_payout_kwd: metrics.addonPayout, total_payout_kwd: totalPayment }));
    }

    // Upsert payment records
    const { error: insertError } = await supabase
      .from('monthly_coach_payments')
      .upsert(paymentRecords, {
        onConflict: 'payment_month,coach_id'
      });

    if (insertError) {
      console.error(JSON.stringify({ fn: "calc-coach-payments", step: "upsert_payments", ok: false, error: "insert_failed" }));
      throw insertError;
    }

    const netCollected = totalGrossRevenue - totalDiscountsApplied;
    const platformRetained = netCollected - totalCoachPayout;

    console.log(JSON.stringify({ fn: "calc-coach-payments", step: "summary", ok: true, coaches_processed: paymentRecords.length, gross_revenue_kwd: totalGrossRevenue, discounts_kwd: totalDiscountsApplied, net_collected_kwd: netCollected, coach_payout_kwd: totalCoachPayout, platform_retained_kwd: platformRetained }));

    // Send email notifications
    try {
      await fetch(`${supabaseUrl}/functions/v1/send-coach-payment-notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ payment_month: paymentMonthStr }),
      });
      console.log(JSON.stringify({ fn: "calc-coach-payments", step: "email_notifications", ok: true }));
    } catch (emailError) {
      console.error(JSON.stringify({ fn: "calc-coach-payments", step: "email_notifications", ok: false, error: "trigger_failed" }));
    }

    return new Response(
      JSON.stringify({
        success: true,
        month: paymentMonthStr,
        coaches_processed: paymentRecords.length,
        total_clients: paymentRecords.reduce((sum, r) => sum + r.total_clients, 0),
        // Revenue metrics
        gross_revenue_kwd: totalGrossRevenue,
        discounts_applied_kwd: totalDiscountsApplied,
        net_collected_kwd: netCollected,
        // Coach payout (from GROSS - discounts absorbed by platform)
        total_coach_payout: totalCoachPayout,
        platform_retained_kwd: platformRetained,
        // Formula reference
        formula: {
          description: 'Coach payout based on GROSS service price. Discounts do NOT reduce coach payout.',
          source_tables: ['service_pricing', 'payout_rules', 'addon_pricing', 'addon_payout_rules'],
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error(JSON.stringify({ fn: "calc-coach-payments", step: "fatal", ok: false, error: "calculation_failed" }));
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
