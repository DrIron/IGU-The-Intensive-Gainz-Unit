# Addon Services Build Spec (Path B)

> Scope: close B6-N4 (addon-services half-built) by rebuilding the feature end-to-end before public launch. Mirrors the patterns shipped in Blocks 1, 6, 8 (atomic RPCs, Tap webhook contract, RLS layering).
>
> Reference findings: `docs/pre-launch-review-findings.md` § "Block 6 -- Sessions/PT findings" (B6-N4) and CLAUDE.md § "Service Tiers & Compensation".
>
> Current state (May 2026): three tables exist (`addon_services`, `addon_purchases`, `addon_session_logs`) seeded with 12 catalog rows. `addon_purchases.sessions_remaining` is a writable integer that nothing decrements; `addon_session_logs` has client-SELECT + admin-FOR-ALL policies but no professional-write policy; no purchase RPC, no log RPC, no refund function, no Tap integration. `SessionsTab.tsx:113-119` and `AddonServicesManager.tsx` already read these tables — FE contract preserved across this rebuild.

---

## 1. Architecture Fixes (10)

### F1. Explicit `addon_purchase_status` enum
Today, "is this pack still usable" is computed at every read site from `(sessions_remaining > 0 AND expires_at > now())`. Two different surfaces disagree about expired packs that still have `sessions_remaining > 0`. Replace with a Postgres enum + trigger-maintained column.

```sql
CREATE TYPE addon_purchase_status AS ENUM (
  'pending_payment',  -- created, Tap charge initiated, not yet captured
  'active',           -- captured, has remaining sessions, not expired
  'consumed',         -- all sessions logged
  'expired',          -- past expires_at with remaining > 0 (forfeited)
  'refunded',         -- full refund issued
  'voided'            -- Tap voided pre-capture
);
```

Status transitions are driven by (a) `tap-webhook` on payment events, (b) the `log_addon_session_atomic` RPC on consumption, (c) a daily cron sweep that flips `active → expired`. No FE writes ever touch the column directly.

### F2. View-derived `sessions_remaining`
The writable `addon_purchases.sessions_remaining` column is the root cause of B6-N4: nothing decrements it, nothing audits drift. Drop the column (Phase 5); compute remaining from `pack_size * quantity - count(addon_session_logs)` via a new view:

```sql
CREATE VIEW addon_purchases_with_remaining AS
SELECT ap.*,
       (ap.quantity * COALESCE(svc.pack_size, 1)) - logs.consumed AS sessions_remaining,
       (ap.quantity * COALESCE(svc.pack_size, 1))                 AS sessions_total
FROM addon_purchases ap
JOIN addon_services svc ON svc.id = ap.addon_service_id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS consumed
  FROM addon_session_logs WHERE addon_purchase_id = ap.id
) logs ON true;
```

Reads route through the view; the column becomes structurally impossible to desync.

### F3. `payment_id` FK to a new `addon_payments` table
Today `addon_purchases.total_paid_kwd` is a number with no link to a payment record. There is no way to: prove the purchase was actually paid, look up the Tap charge id, replay a webhook, or reconcile against `subscription_payments`. Add a parallel `addon_payments` table (same shape and lifecycle as `subscription_payments`), reference it from `addon_purchases`:

```sql
ALTER TABLE addon_purchases
  ADD COLUMN payment_id UUID NOT NULL REFERENCES addon_payments(id) ON DELETE RESTRICT;
```

The FK is mandatory (NOT NULL) — there is no legitimate "free addon" path; admin-comped packs go through a `total_paid_kwd = 0` payment row, not a NULL FK.

### F4. NOT NULL `expires_at` + CHECK
`expires_at` is currently nullable. CLAUDE.md says all packs have a 3-month expiry (the `pack_expiry_months` catalog field). The "no expiry" state was never product-intentional, just a default-NULL drift. Pin it:

```sql
ALTER TABLE addon_purchases
  ALTER COLUMN expires_at SET NOT NULL,
  ADD CONSTRAINT addon_purchases_expires_after_purchase
    CHECK (expires_at > purchased_at);
```

`purchase_addon_atomic` computes it as `purchased_at + (svc.pack_expiry_months || ' months')::interval`.

### F5. Server-side `tier_restrictions` enforcement
`addon_services.tier_restrictions TEXT[]` is set on the Competition Prep addon (`{complete, hybrid, in_person}`) but never checked anywhere — a Team-Plan client could theoretically buy it. Enforce inside `purchase_addon_atomic` against the caller's active subscription service slug; raise `42501` if mismatched. Frontend hides ineligible cards via the same SECURITY DEFINER helper.

### F6. ON DELETE RESTRICT on financial rows
Today `addon_purchases.client_id → auth.users ON DELETE CASCADE` and `addon_session_logs.addon_purchase_id → addon_purchases ON DELETE CASCADE`. Deleting a user wipes their entire purchase + log history — unacceptable for financial reconciliation. Switch both to RESTRICT; soft-delete via a new `deleted_at TIMESTAMPTZ` column on `addon_purchases`; `delete-account` edge fn updates `addon_purchases.deleted_at` instead of `DELETE`.

### F7. Professional-write RLS on `addon_session_logs`
The table has client-read and admin-write but no policy for the actual professional logging the session. Add `is_addon_eligible_professional(p_staff_id, p_purchase_id)` SECURITY DEFINER helper that returns true when the staff user has the matching approved subrole for the service type, AND is an active care-team member for the client. Use it in a new policy + the log RPC's WITH CHECK.

### F8. Numeric & quantity CHECK constraints
Add `CHECK (total_paid_kwd >= 0)`, `CHECK (quantity >= 1)`, `CHECK (discount_percentage BETWEEN 0 AND 30)` (matches the 30 % cap in `calculate_subscription_payout`), and `CHECK (professional_payout_kwd >= 0 AND igu_take_kwd >= 0)` on the catalog. These were missing — `total_paid_kwd` could go negative through a partial-refund bug.

### F9. FOR UPDATE lock in `log_addon_session_atomic`
Two professionals logging the same purchase simultaneously can each see `sessions_remaining = 1` (computed from the view), both INSERT, the purchase ends up consumed by 2 logs against a 1-session pack. Mirror `book_session_atomic`: lock the purchase row FOR UPDATE inside SECURITY DEFINER, recompute remaining from `addon_session_logs` count under the lock, insert atomically, flip status to `consumed` on the final session.

### F10. Snapshot payout columns + active-pack index
`addon_session_logs.professional_payout_kwd` and `igu_take_kwd` are already on the table — keep snapshotting them at log time (catalog price changes shouldn't retroactively repay past sessions). Add the index that's missing for the hottest read path:

```sql
CREATE INDEX idx_addon_purchases_active ON addon_purchases (client_id, status, expires_at)
  WHERE status = 'active';
```

This is what `SessionsTab` + the client purchase flow need to enumerate live packs without a full scan.

---

## 2. RPC Signatures

All three follow project conventions: `p_` params, `v_` locals, `SECURITY DEFINER`, `SET search_path = public`, `RETURNS JSONB`. Permissions explicitly granted; never `TO public`.

```sql
-- F3+F5+F8: atomic purchase, called after Tap CAPTURED webhook
purchase_addon_atomic(
  p_client_id         uuid,
  p_addon_service_id  uuid,
  p_quantity          integer,   -- defaults to 1
  p_payment_id        uuid,      -- addon_payments.id, must exist + be 'paid'
  p_discount_percent  numeric    -- 0..30, used to scale total_paid_kwd
) RETURNS jsonb
```

Locks `addon_services` row, validates `is_active`, validates `tier_restrictions` against caller's active subscription service, computes `total_paid_kwd`, computes `expires_at`, inserts `addon_purchases` with status='active'. Returns `{ purchase_id, sessions_total, expires_at, status }`. GRANT to `service_role` only — invoked from `tap-webhook` after capture.

```sql
-- F7+F9: atomic session log
log_addon_session_atomic(
  p_purchase_id   uuid,
  p_session_date  date,           -- defaults to CURRENT_DATE; CHECK <= today
  p_notes         text
) RETURNS jsonb
```

`auth.uid()` is the implicit professional_id. Acquires `FOR UPDATE` lock on the purchase row, validates `is_addon_eligible_professional(auth.uid(), p_purchase_id)`, validates `status = 'active'` and `now() < expires_at`, recomputes `consumed` from `addon_session_logs`, raises if consumed >= sessions_total, inserts the log with snapshot payout values from `addon_services`, flips `status → consumed` if this was the final session. Returns `{ log_id, sessions_remaining_after, status_after }`. GRANT to `authenticated`.

```sql
-- New: refund variant
refund_addon_purchase(
  p_purchase_id  uuid,
  p_reason       text,
  p_mode         text             -- 'full' | 'partial_unused'
) RETURNS jsonb
```

Admin-only (gated on `is_admin(auth.uid())` inside the body; GRANT to authenticated). Full mode allowed only when zero logs exist (otherwise raise `42501`); partial_unused mode computes refund as `(remaining / total) * total_paid_kwd` and is allowed up to expiry. Flips `addon_purchases.status → refunded`, writes refund row to `addon_payments`, returns `{ refund_amount_kwd, addon_payment_id }`. Tap-side refund is initiated separately by admin via Tap dashboard — this RPC records the local-side state only; reconciliation is via `payment_events`.

---

## 3. Tap Addon-Webhook Contract

Mirror, not extend, the subscription Tap flow. Two new edge functions; `tap-webhook` gains one branch.

### `create-tap-addon-payment` (new)
Same shape as `create-tap-payment`. Internal JWT validation, OPTIONS before `req.json()`, rate-limited 10/min/user. Validates the caller (`auth.uid()`) matches `p_client_id`, validates the addon is eligible via `tier_restrictions` (same helper as F5), inserts an `addon_payments` row with status `'initiated'`, then calls Tap `/v2/charges` with:

```json
{
  "amount": <computed>,
  "currency": "KWD",
  "metadata": {
    "addon_payment_id": "<uuid>",
    "addon_service_id": "<uuid>",
    "client_id": "<uuid>",
    "quantity": "<int>",
    "billing_type": "addon"
  },
  "reference": { "transaction": "txn_addon_<ts>", "order": "igu_addon_<ts>", "idempotent": "igu_addon_<ts>" },
  "post": { "url": "<supabase_url>/functions/v1/tap-webhook" }
}
```

The dedup window in `create-tap-addon-payment` keys on `(client_id, addon_service_id)` 30 s — same pattern as the subscription create.

### `tap-webhook` (modified)
Branch on `charge.metadata.billing_type`:
- `'manual'` (or absent) → existing subscription path, unchanged.
- `'addon'` → new path. Reuses HMAC verification, IP rate-limit, per-charge rate-limit, `payment_events` idempotency, and TAP API re-verify (defense in depth). After `applyCapturedAddonPayment`:
  - update `addon_payments` row to `'paid'`, set `paid_at`, store `tap_charge_id`;
  - call `purchase_addon_atomic` to materialise the purchase row;
  - dedup is anchored on `payment_events.charge_id + status` (existing), so the addon branch piggybacks the same idempotency without a new table;
  - emit an `addon_purchase_confirmed` email via the shared template system (EMAIL_FROM_BILLING).

On `REFUNDED` / `VOIDED`: `applyRefundedOrVoidedAddonPayment` flips `addon_payments → refunded/voided` and `addon_purchases → refunded/voided` (no role revoke — addons don't gate platform access).

Critically: addons are one-shot; no recurring path, no past-due logic. The webhook branch is ~120 lines vs the subscription branch's ~400.

---

## 4. Schema Diff (Migration Blocks)

Apply order matters; each block is one migration file per the splitter-bug workaround (`memory/feedback_supabase_cli_dollar_quote_splitter.md`). Filenames: `20260525000000_*` upward.

```sql
-- 20260525000000_addon_purchase_status_enum.sql
CREATE TYPE addon_purchase_status AS ENUM (
  'pending_payment','active','consumed','expired','refunded','voided'
);

-- 20260525000100_addon_payments_table.sql
CREATE TABLE addon_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  amount_kwd      NUMERIC(8,2) NOT NULL CHECK (amount_kwd >= 0),
  status          TEXT NOT NULL DEFAULT 'initiated'
                  CHECK (status IN ('initiated','paid','failed','refunded','voided')),
  tap_charge_id   TEXT,
  paid_at         TIMESTAMPTZ,
  refunded_at     TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_addon_payments_tap_charge ON addon_payments(tap_charge_id);
CREATE INDEX idx_addon_payments_client ON addon_payments(client_id, status);
ALTER TABLE addon_payments ENABLE ROW LEVEL SECURITY;
-- (policies in the same file: client-read-own, admin-full)

-- 20260525000200_addon_purchases_columns.sql
ALTER TABLE addon_purchases
  ADD COLUMN status     addon_purchase_status NOT NULL DEFAULT 'pending_payment',
  ADD COLUMN payment_id UUID REFERENCES addon_payments(id) ON DELETE RESTRICT,
  ADD COLUMN deleted_at TIMESTAMPTZ,
  ADD CONSTRAINT addon_purchases_total_nonneg CHECK (total_paid_kwd >= 0),
  ADD CONSTRAINT addon_purchases_quantity_pos CHECK (quantity >= 1),
  ADD CONSTRAINT addon_purchases_discount_range CHECK (discount_percentage BETWEEN 0 AND 30);
-- payment_id stays nullable through Phase 0; backfill in Phase 5 then SET NOT NULL.

-- 20260525000300_addon_purchases_expires_at_not_null.sql
-- Phase 5 (after backfill): SET NOT NULL + CHECK.
ALTER TABLE addon_purchases
  ALTER COLUMN expires_at SET NOT NULL,
  ADD CONSTRAINT addon_purchases_expires_after_purchase
    CHECK (expires_at > purchased_at);

-- 20260525000400_addon_purchases_with_remaining_view.sql
CREATE VIEW addon_purchases_with_remaining AS ...;  -- see F2

-- 20260525000500_addon_fk_restrict.sql
ALTER TABLE addon_purchases
  DROP CONSTRAINT addon_purchases_client_id_fkey,
  ADD CONSTRAINT addon_purchases_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE addon_session_logs
  DROP CONSTRAINT addon_session_logs_addon_purchase_id_fkey,
  ADD CONSTRAINT addon_session_logs_addon_purchase_id_fkey
    FOREIGN KEY (addon_purchase_id) REFERENCES addon_purchases(id) ON DELETE RESTRICT;

-- 20260525000600_addon_indexes.sql
CREATE INDEX idx_addon_purchases_active ON addon_purchases (client_id, status, expires_at)
  WHERE status = 'active';

-- 20260525000700_is_addon_eligible_professional.sql  -- helper from F7
-- 20260525000800_purchase_addon_atomic.sql          -- RPC body, ONE function per file
-- 20260525000900_log_addon_session_atomic.sql       -- RPC body
-- 20260525001000_refund_addon_purchase.sql          -- RPC body
-- 20260525001100_addon_session_logs_professional_write_policy.sql
-- 20260525001200_addon_purchases_drop_sessions_remaining.sql  -- Phase 5 destructive
```

12 migrations. Each `CREATE FUNCTION` lives alone in its own file, no trailing statements, per the splitter-bug pattern.

---

## 5. Phased Ship Plan

Dependency order; each phase is one PR.

**Phase 0 — Schema groundwork (non-breaking).** Migrations `00000`-`00400` + `00600` + `00700`. Adds enum, `addon_payments`, new columns (nullable), the view, the helper. No FE changes; existing reads still work; `purchase_addon_atomic` not yet called. **Verification:** `tsc clean`, drift query returns 0, `SessionsTab` still renders.

**Phase 1 — Atomic RPCs.** Migrations `00800` + `00900`. Ships `purchase_addon_atomic` + `log_addon_session_atomic` + the professional-write policy (`01100`). No callers yet from FE; tested via MCP `execute_sql` smoke. **Gate:** 2-tab concurrent-log test on a 1-session pack must reject the second log.

**Phase 2 — Tap integration.** Edge fns `create-tap-addon-payment` (new) + `tap-webhook` (extended branch). Deploys with `--no-verify-jwt` per CLAUDE.md JWT table — addon payment fn has internal auth check, same as `create-tap-payment`. **Gate:** test-mode Tap charge end-to-end materialises an `addon_purchases` row via the webhook.

**Phase 3 — Client purchase FE.** Catalog page (`/services/addons`), checkout sheet (mobile = vaul Drawer, desktop = Dialog per CLAUDE.md mobile rules), purchase confirmation page reusing `PaymentReturn` shape, `useUnusedAddons` hook. **Gate:** browser smoke on staging — purchase a session pack, see it in `SessionsTab`.

**Phase 4 — Professional logging FE.** A `LogAddonSessionDialog` invoked from `SessionsTab` (primary coach / dietitian / physio scope), date picker, notes textarea, optimistic with rollback. **Gate:** logging draws down `sessions_remaining` in the view, status flips to `consumed` on the last session.

**Phase 5 — Refund + destructive cleanup.** Migrations `01000` + `01200` + `00300` (`SET NOT NULL`) + `00500` (`ON DELETE RESTRICT`). Backfill `payment_id` for the (currently 0) existing rows, then `SET NOT NULL` on it as well. Admin refund UI on `AddonServicesManager`. **Gate:** drift query zero, `delete-account` smoke writes `deleted_at` instead of CASCADE.

Phase 5 is the only destructive phase — gate it on 3 zero-drift days post Phase 4 ship.

---

## 6. Time Estimate Verification

Memory had a 14-15 day budget. Per-subtask breakdown (in working days, 1 dev):

- Phase 0 schema + drift watch: **1.0**
- Phase 1 RPC bodies + MCP smoke (incl. concurrent-log test): **2.0**
- Phase 2 edge fns + webhook branch + 2-mode smoke (capture + refund): **3.0**
- Phase 3 FE purchase flow (catalog + checkout + return): **3.0**
- Phase 4 FE logging UI + permission-gated render: **2.0**
- Phase 5 refund RPC + admin UI + backfill + destructive cleanup: **2.5**
- Cross-phase buffer (Sentry triage, smoke regressions, copy review): **1.0**

**Total: 14.5 dev-days.** Sits at the upper end of the 14-15 day budget — no slack. Two risks to flag:

1. **Tap test-mode for one-shot charges** has been less reliable than for subscription charges historically (CLAUDE.md mentions ES256 JWT rejection on the gateway, deploy with `--no-verify-jwt`). Add 0.5 day buffer if Phase 2 smoke surfaces the same gateway quirk.
2. **Phase 3 i18n.** All purchase-flow copy needs `en` + `ar` namespace entries (CLAUDE.md i18n section); not factored above. Add 0.5 day if launching with Arabic at parity (CLAUDE.md confirms `react-i18next`).

Recommended budget: **15.5 dev-days** with explicit buffer rather than 14-15. If launch slip past 2026-07-12 is acceptable (per `memory/feedback_complete_over_deadline.md`), build the full spec; otherwise consider Phase 5 cleanup as a post-launch follow-up (the soft-delete column + view derive must still ship Phase 0; only the destructive `DROP COLUMN sessions_remaining` and `SET NOT NULL` on `payment_id` defer).

---

## Open Questions

- **Comped packs** — admin issues a free 4-pack as a goodwill credit. Path: insert `addon_payments` row with `amount_kwd=0, status='paid'`, then `purchase_addon_atomic`. UI-side, this is an admin action on `AddonServicesManager`. Decision: ship in Phase 5 or post-launch.
- **Care-team-member professional eligibility** — should a dietitian be able to log a "Sports Psychologist Session" if assigned to the client? Default no (helper checks subrole slug must match service type's professional). Confirm with product before Phase 1.
- **Expiry sweep cadence** — daily Vercel Cron (similar to `process-renewal-reminders`) flipping `active → expired` on `expires_at < now()`. Or compute at read time and never write `expired`? View-derive is cheaper, but loses a sortable column for reporting. Default: daily sweep, single edge fn `process-addon-expiries`.
- **Refund webhook reconciliation** — if admin refunds via Tap dashboard, the existing `tap-webhook` `applyRefundedOrVoidedPayment` only handles subscription rows. The new addon branch handles addon rows. Both call paths route through the same webhook fn; no extra reconciliation job needed.
