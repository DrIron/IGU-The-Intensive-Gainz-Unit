# Plans Marketplace — Plan

_Planning doc (shape / model / phases / open decisions)._
_Owner track: FOR_LATER planning session. Created 2026-07-05. Mockups: `docs/PLANS_MARKETPLACE_MOCKUPS.html` (/plans browse, listing detail + one-time buy, buyer library w/ sync, coach list-toggle, admin cut-config + sales)._

Coaches list prebuilt **workout programs** for sale; buyers purchase → the plan lands in their **library**
to start anytime. Promoted from `docs/FOR_LATER.md`. This idea also **motivates a bigger strategic shift**
— clients being able to hold accounts **without a coach** — captured in Part 8 as a flagged, not-yet-final
dependency.

> **What already exists (leverage it):** the canonical program model (`plan` + `muscle_program_templates`
> + `client_plan_assignment`) and the **clone-and-assign** RPC `assign_template_to_client_canonical`
> (clones a template's canonical plan into a client's own copy). A purchase is essentially that clone,
> triggered by a payment instead of a coach. **What's new:** a **one-time payment** path — today all
> payments are subscription/recurring (Tap), so one-off purchases are net-new plumbing.

---

## 1. Decisions locked (2026-07-05)

| # | Decision | Choice |
|---|----------|--------|
| PM1 | Sellable unit | **Workout programs only** — listable at the **mesocycle** (a training block / plan) **or macrocycle** (multi-block program) level, **from the programs area** (the builder), not a separate flow. Meal-plan templates **not** sellable yet (maybe later). |
| PM2 | Delivery | Purchase → **clone the template's canonical `plan` into the buyer's library** (they own their copy), **source-linked** for sync. Lives in the library, start anytime. |
| PM3 | IGU cut | **Admin-configurable** on an admin page — a **percentage OR a fixed amount** per sale (value TBD). The rest is the coach's payout. |
| PM4 | Who can buy | **Both** standalone plan-clients (no coach) **and** existing coached clients (e.g. service ending, wants to keep a plan). Purchase → their library. |
| PM5 | Sync | **In scope.** When a coach edits + **syncs** a template, the update **propagates to buyers' library copies** (coach-initiated). Requires source-linked copies + versioning. |
| PM6 | Coach-detachment | **Strategic direction (NOT finalized):** clients may hold accounts **without a coach** via an **IGU self-service subscription**; IGU's cut becomes a per-account fee embedded per tier. See Part 8. |

---

## 2. The buyer + the "plan client"

- A **plan client** is a **coach-detached** account: they own **purchased plans in a library**, can start
  one and log workouts against it, use self-service tools (calorie calculator, workout/exercise library),
  but have **no coach, and appear on zero coaching surfaces** — no roster, no care-team, no coach messages,
  no adherence/nutrition-phase coaching, no PHI. This is the FOR_LATER "self-service plans role, like a Team
  member but coach-detached."
- **Existing coached clients** can also buy — the plan just adds to their existing library alongside their
  coached program.
- **Hard invariant:** a plan-client (or a coached client's *purchased* plan) must never leak into
  coach/roster/payout/PHI queries. Reuse the `payment_exempt`-style discipline — every coaching surface
  already filters by coach relationship; a purchased plan has **no coach relationship**, so it's naturally
  excluded, but audit each roster/adherence/care-team query when this ships.

---

## 3. Data model (sketch)

```
marketplace_listings         -- a program (mesocycle OR macrocycle) put up for sale
  id, source_type ('mesocycle'|'macrocycle'), source_id (meso template / macrocycle), coach_id,
  title, description, cover_image_url, price_kwd,
  status ('draft'|'listed'|'unlisted'), version, created_at

plan_purchases               -- a completed sale
  id, buyer_id, listing_id, price_paid_kwd,
  igu_cut_kwd, coach_payout_kwd,           -- split at purchase time (PM3)
  tap_charge_id, purchased_at,
  cloned_plan_id (FK plan),                -- the buyer's owned copy
  source_version                           -- listing.version at purchase (for sync)

marketplace_settings         -- single-row admin config (PM3)
  igu_cut_type ('percent'|'fixed'), igu_cut_value

plan_reviews                 -- buyer rates a plan, app-store style (Gap 5)
  id, listing_id, buyer_id, rating (1-5), text, created_at
  -- only from a buyer who purchased it; one per (buyer, listing); drives listing rating + discovery

-- buyer's library = their client_plan_assignment / plan rows (owned clones),
-- each carrying source_template_id + source_version for sync (PM5).
```
- **Listing** rides on the existing template (a coach flags a template for sale + sets a price) — no new
  builder, just a **"list on marketplace" toggle + price** when editing a template (FOR_LATER note).
- **Purchase split:** at purchase, compute `igu_cut` + `coach_payout` from `marketplace_settings`
  (percent or fixed). New payout path — **separate from the subscription payout RPC** (which is
  per-client-per-month); this is per-sale.

---

## 4. Purchase flow (one-time payment — the new plumbing)

1. Buyer taps **Buy** on a listing (plans page or coach page).
2. If not signed in / no account → a **lightweight signup** (a plan-client account — no coach selection,
   no full coaching onboarding). Existing clients just buy.
2b. **Waiver + expectation (Gap 1 + 9).** Before paying, the buyer accepts a **self-guided waiver /
   disclaimer** ("consult a physician; IGU isn't supervising") and sees the **expectation copy** — this is
   a **self-guided plan: no check-ins, no adjustments, no coach messaging**. The coach has no coaching
   duty/ability toward a marketplace buyer.
3. **One-time Tap charge** (new edge fn, e.g. `create-plan-purchase` → Tap one-off, then verify) — distinct
   from `create-tap-payment` (subscriptions). No subscription row, no recurring billing.
4. On success: **clone the listing into the buyer's library** — a **mesocycle** clones via
   `assign_template_to_client_canonical`, a **macrocycle** via `assign_macrocycle_to_client_canonical`
   (both coach-detached variants) — record `plan_purchases` with the split, source-link the clone.
5. Buyer sees it in their **library**; starts it whenever.

---

## 5. Sync + versioning (PM5)

- The buyer's copy keeps `source_template_id` + `source_version`. The coach edits their program and hits
  **"Sync / publish update"** → `listing.version` bumps → buyers see an **"update available"** and **apply
  it** (buyer-accepts, not silent overwrite; mockup screen 3).
- **Follow-only keeps this clean (Gap 4).** Buyers can't edit the plan *structure* — only **swap an
  exercise** and **add an open set** at log time, both of which live in the **log layer**. So a Sync
  **re-applies the coach's structure to future/unstarted weeks**, and the buyer's **completed logs + swaps
  are preserved** — there's no forked structure to merge against.
- **Macrocycle sync is heavier** than a single mesocycle (multiple blocks) — note the added complexity;
  same model, more surface.

---

## 6. Surfaces

| Surface | What |
|---------|------|
| **Plans page** (`/plans`, public) | Browse listings — filter by coach / goal / price; **plan rating** (from `plan_reviews`) on cards; each card → detail → Buy. Detail shows buyer reviews. |
| **Coach page** (`/coach/:slug`) | The coach's **catalogue** of listings — ties into `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md` (their page already exists there). |
| **Buyer library** | Client account "My plans" — purchased plans, start/continue. |
| **Coach — list from the programs area** | A **"list on marketplace" toggle + price** on a **mesocycle or a macrocycle** in the programs builder — where coaches already create them. No new builder / separate flow. |
| **Admin** | `marketplace_settings` (IGU cut % / fixed), a **light moderation floor** (unlist/remove a plan; **not** a pre-approval gate — see below), sales + payout reporting. |

---

## 7. Phases

- **MP1 — Listings + purchase (existing clients first).** `marketplace_listings` + coach "list a template"
  toggle + price; `/plans` browse + coach-page catalogue; **one-time Tap purchase** → clone to library;
  `plan_purchases` + admin IGU-cut config + payout split. Buyers = existing accounts. _Verify: a client
  buys, a source-linked clone lands in their library, split recorded; a purchased plan appears on zero
  coaching surfaces._
- **MP2 — Plan-client accounts (coach-detached signup).** Lightweight signup for buyers with no account;
  the plan-client account model (library + self-service tools, no coach, excluded from all coaching
  surfaces). _Verify: a brand-new plan-client can buy + use a plan; never appears in a roster/care-team._
- **MP3 — Sync + versioning (PM5).** Coach "sync update" → propagate to buyers, preserve logged history.
- **MP4 — (strategic, gated on Part 8) no-coach IGU subscription tier + financial-model change.**

---

## 8. Strategic context — detaching clients from coaches (FLAGGED, not finalized)

The marketplace motivates a bigger shift Hasan is weighing (**not yet decided — capture, don't build**):

- **Clients without coaches.** A client could hold an account via an **IGU self-service subscription** —
  account + self-service tools (calorie calculator, library) + the ability to **buy plans** — with **no
  coach**.
- **IGU-cut restructure.** Today IGU's ops cut is baked into each coached service tier. The idea: make IGU's
  cut a **per-account fee** that's **embedded in whichever tier the client is on** — no-coach / team /
  with-a-coach — "theoretically waived" for coached clients (their tier already funds IGU). Net: IGU is paid
  a fixed cut for **running the account**, regardless of coaching.
- **Why it matters here:** the plan-client (Part 2) is the first "no-coach account." Whether they *also*
  pay a recurring IGU self-service subscription (vs only one-time plan purchases) is exactly this decision.
- **Account model change (Gap 2).** Treat **"has a library" and "has a coach" as independent** rather than
  a single "client = has a coach" type. A new user can start **plan-only** or go **straight into coached
  onboarding**; the work is the **transitions on existing accounts** (plan-client → takes a coach; coached
  client whose service ends → keeps their library as a plan-client). Settle these with the financial call.
- **Coach operating model → the external-coaches plan.** Direction Hasan is leaning: run IGU like
  Trainerize / Train Heroic — **coaches pay a subscription** to run their clients on the app, and IGU takes
  a **cut** on marketplace sales + team plans, with a **separate IGU-approved coach team run differently**.
  This is the **external/independent coaches** FOR_LATER idea; the marketplace's per-sale coach payout + the
  IGU cut model are **finalized there**, not here.
- **This changes the financial plan** (`business-planning/*`, the payout/pricing model, `igu_operations_costs`,
  `calculate_subscription_payout`). It likely deserves **its own plan doc** once Hasan finalizes the model.
  **The marketplace can ship MP1–MP3 without it** (existing-client purchases + one-time plan-client
  purchases); MP4 waits on this decision.

---

## 8b. Gaps & connections addressed (2026-07-05 review)

Surfaced by mapping this against the rest of IGU; decisions from Hasan:

1. **Liability / medical waiver (must-fix).** A plan-client does a workout program with **no coach and no
   PAR-Q**. Add a **waiver / disclaimer at purchase** — "self-guided, consult a physician, IGU is not
   supervising." (Possibly a lightweight PAR-Q later.) The coached PAR-Q flow doesn't cover buyers.
2. **Account-type transitions & dual-holding (the "change how accounts are made").** Model **"has a
   library" and "has a coach" as independent**, not one client type. **Fresh start is easy** — a new user
   starts **plan-only** (buy → library) *or* goes **straight into coached onboarding**. The hard part is
   **existing accounts**: a plan-client later taking a coach, or a coached client whose service ends
   keeping their library (→ plan-client). **These transitions + the IGU-cut/operating model need to be
   settled with the broader account/financial decision (and the external-coaches plan) BEFORE this ships.**
   Flagged, coordinated — not finalized here.
3. **Payment robustness (must-fix engineering).** The one-time path needs: **idempotent clone-on-webhook**
   (`tap-webhook` can fire twice → never deliver twice), **failure/retry** UX, **refund/chargeback →
   revoke** the cloned plan, and receipts (`getTapReceiptUrl` exists).
4. **Buyers can't edit the plan structure → sync stays clean (decided).** Purchased plans are
   **follow-only**. At **log time** the buyer may **swap an exercise** (existing logger swap) and
   **add a set** — an added set is an **"open set"** (log reps + rest freely; RIR optionally mirrors the
   prior set) à la Train Heroic. Swaps/open-sets live in the **log layer**, so a coach **Sync** re-applies
   the coach's structure to future weeks **without** fighting a forked copy; the buyer's logs are preserved.
5. **Plan-level reviews / ratings (adopted).** Buyers rate the **plan** (app-store style) — trust +
   discovery, and it plugs into the reputation system. See §3 (`plan_reviews`) + §6.
6. **Coach payout / IGU-cut → the SaaS model (defer to external-coaches plan).** Direction: run IGU more
   like Trainerize / Train Heroic — **coaches pay a subscription** to run their clients on the app; IGU
   takes a **small cut (% or fixed)** on marketplace sales + team plans. Plus a **separate IGU-approved
   coach team run slightly differently**. This is the **external/independent coaches** plan; the
   marketplace's per-sale coach payout + IGU cut are settled there. Capture here, finalize there.
7. **Coach leaves / deactivated → buyers ALWAYS keep their clones (decided).** They own the purchased
   copy. On coach departure/deactivation the **listings unlist** and **sync stops**, but every buyer keeps
   and can run their plan. (Mirrors the coach-lifecycle handling in the coach-profile plan.)
8. **Waitlist + international buyers (UNRESOLVED — open).** Is `/plans` live while WaitlistGuard is on?
   And **Tap is Kuwait/GCC** — a public marketplace could draw **international** buyers who can't pay via
   Tap. Hasan: no answer yet — flagged as a go-to-market/payments decision (Part 9).
9. **Expectation-setting (decided, explicit).** A bought plan is **completely self-guided — no check-ins,
   no adjustments, no messaging**, and the **coach cannot coach a marketplace buyer** (no obligation, no
   ability). Make this explicit at purchase and in the library.

## 9. Open decisions

1. **IGU cut** — percent vs fixed default + the actual value (admin-configurable either way).
2. **Sync propagation strategy** (§5) — coach-push-with-log-preservation vs buyer-accepts-update.
3. **No-coach account = recurring IGU subscription or one-time-purchases-only?** (Part 8 — the financial call.)
4. **Refunds / chargebacks** on a one-time purchase, and what happens to the cloned plan on refund.
5. **Listing moderation** — RECOMMENDED **light floor**: coaches **self-list instantly** (no pre-approval
   gate); the admin can **unlist / remove** a plan if there's a quality or brand problem (same shape as the
   testimonial moderation floor). Confirm vs a pre-approval gate (which slows coaches down and isn't very
   IGU, given coaches already own their content).
6. **Pricing bounds / floors** and whether IGU sets min/max, currency (KWD), taxes.
7. **Coach payout mechanism** for sales — how/when coaches are paid their share — **finalized in the
   external-coaches plan** (coach-subscription + IGU-cut operating model, Gap 6).
8. **Waitlist + international buyers (UNRESOLVED)** — is `/plans` live during waitlist mode; and Tap is
   Kuwait/GCC, so international buyers can't pay via Tap. A go-to-market + payments decision (Gap 8).

---

## 10. Dependencies & intersections

- **Program-canonical model** — `plan` / `muscle_program_templates` / `client_plan_assignment` +
  `assign_template_to_client_canonical` (the clone engine). Marketplace = payment-triggered clone.
- **Payments** — a **new one-time Tap path** (all current flows are subscription). Tap one-off charge +
  verify + webhook handling for purchases.
- **Coach profile page** — `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md` (the catalogue lives on `/coach/:slug`).
- **Roles / onboarding** — a coach-detached **plan-client** account type + lightweight signup; the invariant
  that they stay out of every coaching/roster/PHI surface.
- **Financial model** — Part 8 (IGU-cut restructure) touches `business-planning/*`, payout RPCs,
  `igu_operations_costs`. Not finalized.
- **External/independent coaches** (other FOR_LATER idea) — related (both add non-standard account types);
  keep the models consistent when that's planned.
