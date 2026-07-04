-- P0 access-boundary hardening — subscriptions: clients read-only (Hasan, 2026-07-04).
--
-- "Block unauthorized subscription access" is (despite its name) a PERMISSIVE ALL policy with a
-- bare self-check (auth.uid()=user_id OR admin OR coach-of-own). Because it's ALL and its
-- with_check is null, that self-check applies to INSERT/UPDATE too — a client could self-insert a
-- subscription (arbitrary coach_id/status/client_price_kwd) or update their own (flip status,
-- null the price) via the direct API. Latent (subscriptions are written by edge functions with
-- the service role, which bypasses RLS), but a real self-grant / price-tamper path.
--
-- Fix: recreate it SELECT-only (same expr) and drop the redundant self-INSERT policy. Writes are
-- then admin-only via RLS (tpl2_admin_all ALL + "Only admins can update subscription assignments"
-- UPDATE); edge functions keep writing via the service role (RLS-bypass, unaffected). Self-SELECT
-- stays covered by tpl1_self_select + "Users can view their own subscriptions" + the recreated
-- policy; coach/dietitian/team SELECT policies are untouched.

DROP POLICY "Block unauthorized subscription access" ON public.subscriptions;

CREATE POLICY "subscriptions_read_self_admin_coach" ON public.subscriptions
FOR SELECT TO public
USING (
  auth.uid() = user_id
  OR public.is_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'coach') AND auth.uid() = coach_id)
);

-- Redundant self-INSERT path — clients must never insert their own subscription.
DROP POLICY "Users can insert their own subscriptions" ON public.subscriptions;
