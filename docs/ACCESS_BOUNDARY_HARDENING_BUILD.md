# Access-boundary hardening — write policies gated only by "it's my row"

**Status:** Build handoff (2026-07-04, Cowork). **Owner:** terminal. Cowork verifies on prod.
Follow-on to the testimonials clients-only gate: an audit of `pg_policies` for the same class of gap — a write allowed by a **bare self-check** (`auth.uid()=user_id`) on a row that **affects another party or has a financial effect**. Self-owned tracking tables (`weight_logs`, `body_fat_logs`, `step_logs`, `adherence_logs`, `weekly_progress`, `nutrition_goals`, `form_submissions*`, `onboarding_drafts`, coach/dietitian self-profile) are **correct as-is** — excluded. These are the items that need rewiring, priority-ordered.

---

## P0 — `subscriptions`: clients can self-write money/assignment rows (latent)
**Finding (verified on prod 2026-07-04):** policies are all PERMISSIVE (OR-ed). `"Block unauthorized subscription access"` — despite the name — is a **PERMISSIVE `ALL`** policy with expr `(auth.uid()=user_id OR is_admin(...) OR (has_role(coach) AND auth.uid()=coach_id))`. Because it's `ALL`, that self-check applies to **INSERT and UPDATE** too — so a client can, via direct API, **insert their own subscription** (arbitrary `coach_id`/status/`client_price_kwd`) or **update their own** (e.g. flip `status='active'`, null the price). Plus a redundant `"Users can insert their own subscriptions"` INSERT policy. Nothing in the frontend does this (subscriptions are written by edge functions using the **service role**, which bypasses RLS), so it's latent — but it's a real self-grant/price-tamper path.

**Fix — migration `..._subscriptions_read_only_for_clients.sql`:**
1. Drop `"Block unauthorized subscription access"` (ALL) and recreate it as **SELECT-only**, same expr:
```sql
DROP POLICY "Block unauthorized subscription access" ON public.subscriptions;
CREATE POLICY "subscriptions_read_self_admin_coach" ON public.subscriptions
FOR SELECT TO public
USING (
  auth.uid() = user_id
  OR public.is_admin(auth.uid())
  OR (public.has_role(auth.uid(),'coach') AND auth.uid() = coach_id)
);
```
2. Drop the redundant self-insert policy: `DROP POLICY "Users can insert their own subscriptions" ON public.subscriptions;`
3. Leave intact: `tpl2_admin_all` (admin ALL), `"Only admins can update subscription assignments"`, and all the other SELECT policies (self / team-coach / dietitian / assigned-coach). **Writes are now admin-only via RLS; edge functions keep writing via service role (RLS-bypass).**

**Verify (Cowork, rolled-back jwt tests):** as a client — SELECT own sub → OK; **INSERT** own sub → `42501`; **UPDATE** own sub (`status='active'`) → `42501`. As admin — insert/update → OK. Then smoke that a real signup/payment still creates a subscription (edge-fn path, service role) — e.g. create-manual-client / verify-payment flow unaffected.

## P1 — `team_waitlist`: fully open INSERT (`WITH CHECK true`)
Anyone (incl. anon) can insert any `team_id`/email with no validation — spam/garbage surface (contrast `leads`, which validates). Keep anon capture, add validation.
**Fix:** replace the `"Anyone can join team waitlist"` INSERT `WITH CHECK (true)` with: valid email regex + length bounds (mirror the `leads` policy) **AND** `team_id IN (SELECT id FROM coach_teams WHERE is_active AND is_public)` (can only waitlist a real, joinable team). Keep roles `anon, authenticated`.
_(Note: the head-coach SELECT policy for waitlist mgmt is specced separately in `docs/TEAMS_MANAGEMENT_BUILD.md` §4 — this item is just the INSERT tightening; don't duplicate the SELECT policy.)_

## P1 — `coach_change_requests`: unvalidated `requested_coach_id`
INSERT gated only by `auth.uid()=user_id`; the row names a `requested_coach_id` (target coach) that isn't validated — a client can request assignment to any id, or to themselves.
**Fix:** extend the INSERT `WITH CHECK` with `requested_coach_id <> auth.uid()` AND `EXISTS (SELECT 1 FROM coaches c WHERE c.user_id = requested_coach_id)` (real coach). Optionally `requested_coach_id IS DISTINCT FROM current_coach_id` (don't request your current coach). Still admin/coach-approved downstream, so this is defense-in-depth. **Verify:** client requesting a non-coach id or self → rejected; requesting a real different coach → OK.

## P1 — URL-param-trusted coach identity (the `?coach=` family)
The testimonials `?coach=` self-endorsement vector exists in two more spots (`grep searchParams.get`):
- **`Auth.tsx:235` signup `?coach=`** — pre-selects a coach at signup. Confirm it's only a *preselection hint* carried into onboarding (where coach assignment is server-validated), and cannot itself write a coach binding client-side. If it can, validate the id against `coaches` before use.
- **`CoachSignup.tsx` / `CoachPasswordSetup.tsx` `?coach_id=`** — coach-invite activation. Confirm the `coach_id` is validated **against the invite** (the invited coach record / token), not trusted as arbitrary — so someone can't point the flow at another coach's id to claim/activate an account. If validation is only client-side, move it to the edge fn (`create-coach-account` / the setup RPC).
**Verify:** tampering the param with an arbitrary/other coach id does not bind or activate the wrong coach (rejected server-side).

## P2 — `coach_applications`: anon INSERT (by design)
`anon_can_submit_applications` allows anon INSERT where `status='pending'` — intended (public "apply to coach"). Just **confirm the frontend path is Turnstile-gated + rate-limited** (like the waitlist/lead forms) so it isn't a spam sink. No policy change unless it's ungated. **Verify:** the application form requires Turnstile; the edge fn (`send-coach-application-emails`) has rate limiting.

---

## Migrations & order
Each item is its own migration (one concern each), `YYYYMMDDHHMMSS_*`. P0 first. Follow REVOKE/GRANT rules if any helper function is added (P1 coach_change_requests may inline the `EXISTS` — no new function needed). No new SECURITY DEFINER functions strictly required.

## Global verify (Cowork)
- Re-run the audit query (`pg_policies` write policies with bare self-check on cross-party/financial tables) → only the self-owned tracking tables remain (expected).
- P0 subscriptions jwt matrix passes; a real subscription still gets created via the edge-fn/service-role path.
- tsc/build clean; Sentry quiet; no legit flow (signup, payment, team join, coach change request, coach invite) regresses.
