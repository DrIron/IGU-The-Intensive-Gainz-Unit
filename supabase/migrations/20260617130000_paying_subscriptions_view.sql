-- Anti-recurrence primitive for the payment-exempt counting bug.
--
-- Payment-exempt clients (head-coach/admin comps; profiles_public.payment_exempt
-- = true) hold an ACTIVE subscription but pay nothing. They must never be counted
-- in revenue totals, paying-client counts, "active/new paying clients" tiles, or
-- payouts. The bug kept recurring because every metric re-queried `subscriptions`
-- directly and re-forgot the exempt filter (AdminMetricsCards revenue, admin daily
-- summary, etc.).
--
-- `paying_subscriptions` is the single canonical exempt-excluded source. MONEY /
-- PAYING-CLIENT surfaces must read from it instead of `subscriptions`; a new
-- surface that does so is correct by construction. OPERATIONAL surfaces that must
-- still include exempt clients (coach workload/capacity, coaching-engagement
-- digests, status pipelines, system-health) keep using `subscriptions`.
--
-- security_invoker = true so the caller's RLS on subscriptions + profiles_public
-- still applies (admins see all, coaches see their clients) -- the view is NOT a
-- privilege-escalation path.

CREATE OR REPLACE VIEW public.paying_subscriptions
WITH (security_invoker = true) AS
SELECT s.*
FROM public.subscriptions s
JOIN public.profiles_public pp ON pp.id = s.user_id
WHERE COALESCE(pp.payment_exempt, false) = false;

COMMENT ON VIEW public.paying_subscriptions IS
  'subscriptions of non-payment-exempt clients only. Canonical source for revenue / paying-client / new-paying-client metrics. Operational/workload surfaces use subscriptions directly. security_invoker=true (caller RLS applies).';

GRANT SELECT ON public.paying_subscriptions TO authenticated, service_role;
