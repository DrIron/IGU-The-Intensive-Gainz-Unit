# Food Logging System — Plan & Build Spec

_Full build spec (data model, screen-by-screen UX, page-by-page changes, phases). Mockups: `docs/FOOD_LOGGING_MOCKUPS.html`._
_Owner track: FOR_LATER planning session. Created 2026-07-05, deepened to a complete build spec 2026-07-05._

> **Parts I–III are the plan** (why / decisions / data model). **Parts IV–VIII are the build spec**
> (design language, screens, related-page changes, component inventory, detailed phasing). Read the
> plan first; the spec assumes it.

Parked idea promoted from `docs/FOR_LATER.md` → "Food logging system for clients". This
doc captures the agreed shape so it can be picked up cleanly later. Sibling idea
**Dietitian dashboards** (still parked in FOR_LATER) depends on the data model below.

---

## 1. Why — the current gap

IGU has **no per-meal food logging**. Nutrition today is:

- Coach-set targets — `nutrition_phases` + `nutrition_goals` (kcal + P/F/C computed via
  `calculateNutritionGoals()` in `src/utils/nutritionCalculations.ts`).
- Weekly **self-report** adherence — `adherence_logs` with a 3-level scale
  (`calorie_adherence` = on_point / mostly / off_track, `tracking_accuracy` =
  weighed / estimated / guessed). This is a *proxy* for "did the client eat to plan",
  not actual intake data.

A food logging system replaces the proxy with real data: the client logs what they eat,
the app rolls it up to daily kcal/macros/micros, and that flows into the coach and (deeper)
dietitian surfaces. It also sets up the **role-layered access** that the specialist/dietitian
direction wants — the same log exposes different depth per viewer role.

---

## 2. Decisions locked (2026-07-05)

| # | Decision | Choice |
|---|----------|--------|
| D1 | v1 ambition | **Full MFP/Cronometer-class parity** — food log inside Nutrition, branded foods, full micros, meal blocks (barcode later) |
| D2 | Food DB scope | **Generic + branded** (USDA Foundation + SR Legacy + Branded *search*). **Barcode deferred** (2026-07-05) — search / type entry only for now |
| D3 | Adherence tie-in | **Logs feed adherence math** — logged intake vs phase targets drives coach adherence % + expected-vs-actual, eventually retiring the self-report proxy |
| D4 | Platform | **Web-first (PWA)** in the existing React app, mobile-optimized |
| D5 | Navigation | **No new nav item / no separate Diary.** The food logger lives **inside the client Nutrition section** (`/nutrition`). Client nav stays **Dashboard · Nutrition · Workout · Learning · More** |
| D6 | Logging units | **Flexible units** — enter by **g / kg / ml / L** plus household servings (per food). Everything normalizes to grams for nutrition math. Fast, adaptable entry is the priority |
| D7 | Adherence thresholds | **Hybrid** (2026-07-05) — ship **fixed** platform bands now (adherent ±10%, slightly off ±20% of calorie target), add an **optional coach override** in a later slice. Build proceeds on the fixed defaults |
| D8 | Adherence basis + macro alerts | **Calorie-based band** (D7). Separately, **alert when any macro is off-prescription**, with a **two-tier prominence: loud for protein + calories, quiet for fat + carbs** (2026-07-05) |

These are ambitious on purpose — consistent with the "complete the model, not a deadline
workaround" posture. Phasing (Section 6) is how we make parity shippable in slices. **Barcode is
explicitly out of v1** and re-enters as an optional later slice.

---

## 3. Data source — USDA FoodData Central (FDC)

The "FDA generic foods" idea resolves to **USDA FoodData Central** (fdc.nal.usda.gov), the
canonical US government nutrient database.

- **License: CC0 1.0 (public domain).** USDA-produced datasets are not copyrighted — we can
  ingest, store, and redistribute freely. (Branded data is an industry public-private
  partnership but is published under the same open terms in FDC.)
- **Datasets we care about:**
  - **Foundation Foods** + **SR Legacy** — generic, non-branded whole foods (chicken breast,
    minced beef at fat %, steaks, etc.). A few thousand items, lab-analyzed, **rich micros**.
    This is the "generic FDA foods" seed.
  - **Branded Foods** — 300k+ packaged products with **UPC/barcode**. Big; label-derived
    (macros always, micros partial).
  - _(FNDDS survey foods — not needed; skip.)_
- **Units:** analytical foods store nutrient `amount` **per 100 g**. Portions/servings are
  separate records — normalize to per-100g internally, present per-serving.
- **Access:** bulk **CSV/JSON monthly dumps** (for the generic seed) + a **REST API** with a
  free key (rate-limited; `X-RateLimit-Remaining` header). Bulk for seed, API for on-demand
  branded/barcode lookups.

**Architecture consequence (important):** don't bulk-load all 300k branded items into Postgres.
- **Bulk-load** Foundation + SR Legacy (generic, small, micro-rich) into our own `foods` table
  → fast local search, full micros, offline-safe.
- **Branded** → hit the FDC API on demand (name search), then **cache the hit** into the same
  `foods` table (`source = 'usda_branded'`, `cached_at`). Coverage grows with use, DB stays lean.
  A periodic refresh can re-pull stale cached branded rows.
- **Barcode / UPC lookup is deferred** (D2). The `upc` column stays in the schema so barcode can
  drop in later without a migration, but there is no scanner or UPC lookup in v1.

### Partner / restaurant data (collabs) — IGU-approved, global to all clients

When IGU has permission from a restaurant/brand to publish their **approved** nutrition data, it enters
as a **third food source** alongside USDA generic and branded — curated and trusted, available to
**every client** the moment it's approved. For a GCC coaching business this is arguably the *most*
valuable source: a client logging "chicken shawarma" or a specific café's protein bowl gets an accurate,
official entry instead of a guessed USDA generic. It's also cleaner than MFP's crowd-sourced branded
mess — every partner item is IGU-verified.

**How it works (mechanism):**
- **New source `source = 'partner'` + a `restaurants` table** (partner identity, logo, partnership
  status). Partner foods are **global rows** (`owner_user_id = NULL`), so RLS read-all makes them
  instantly searchable by all authenticated clients — the exact same distribution path as the USDA
  generics. No per-client copying; add once, everyone sees it.
- **Ingestion = admin-curated import.** The restaurant provides their menu + per-item macros (a
  spreadsheet, a PDF, or an API if they have one); an **admin import tool** loads it into `foods` /
  `food_portions` under that restaurant, flagged **"Partner verified"** with the brand's name + logo.
  (A future self-serve **restaurant portal** could let approved partners manage their own menu, but v1
  is admin-curated — simpler, and IGU controls quality.)
- **Search UX:** partner items show a **restaurant badge / logo** and can be grouped or filtered
  (a "Restaurants" facet in the search tabs). Same result-row + unit/portion + `NutritionSummary`
  flow as any other food.
- **Micros / role-layered read:** whatever the restaurant provides flows through the same model —
  restaurants usually give calories + macros (+ often sodium), so the coach sees macros and the
  dietitian sees whatever micros exist. No special-casing.
- **Maintenance & history:** menus change — re-import updates the items, and discontinued items get
  `is_active = false` (soft-delete, never hard-delete). Because each **log entry snapshots** its
  nutrition at log time, a client's history stays correct even after a restaurant revises or drops an
  item.
- **Permission / provenance:** the `restaurants` row records the partnership (who approved, when, scope)
  so the data's authority is auditable — important since we're publishing it under IGU's name.

This is additive and doesn't change any client-facing flow — a partner food logs exactly like a USDA
food. It slots in as a build phase after the generic + branded foundation (see Part VIII).

### Approved shared foods — the Food Library Manager (admin/dietitian curation)

All the sources above (USDA generic, branded, partner) plus staff-added items converge into one
**approved, shared catalog** that every client searches. We need a **management interface** to govern
it — the nutrition analog of the existing **`WorkoutLibraryManager`** / `exercise_library` admin tool.
This is what keeps IGU's catalog trustworthy (the opposite of MyFitnessPal's crowd-sourced noise):
**only approved items are shared globally.**

**`FoodLibraryManager` (admin, and approved dietitians):**
- **Add / edit / approve** foods that become **global shared rows** (`owner_user_id = NULL`) visible to
  all clients via RLS read-all — the same distribution path as USDA/partner data. Add once → linked for
  every client.
- **Approval + provenance on every food.** Extend `foods` with `approval_status
  ('approved'|'pending'|'rejected')`, `approved_by`, `approved_at`. Only `approved` global rows surface
  in client search. Each food keeps its **source** (`usda_*` / `partner` + `restaurant_id` / `igu_staff`)
  so the origin is always visible and auditable — the search row shows the matching badge
  (Verified / Branded / Partner · <restaurant> / IGU-approved).
- **Promote client custom foods → shared.** A client's private `custom` food that's clean and common can
  be **reviewed and promoted** into the approved catalog (with de-dupe against existing items), so good
  data spreads to everyone without opening the floodgates. Rejected ones stay private to their owner.
- **Governance is the point:** client-added `custom` foods remain **private by default** (owner-scoped
  RLS). Nothing becomes shared until a staff member approves it here. Bulk ingestion (USDA seed, partner
  import) lands as `approved` rows authored by the importer.

**Who can curate:** admin always; **approved dietitians** are the natural nutrition-authority curators —
gate the write path on `is_admin OR has_approved_subrole('dietitian')` (open sub-decision: allow all
dietitians, or admin-only in v1). Reads (the client-facing catalog) stay open to all authenticated
clients.

---

## 4. The model (schema shape — not final DDL)

Everything below is Supabase Postgres + RLS, following IGU conventions (see `CLAUDE.md`:
destructure `{ error }` on mutations, `.maybeSingle()`, REVOKE-pattern on any SECURITY DEFINER
RPC, role helpers `is_dietitian_for_client` / `is_care_team_member_for_client` / `can_edit_nutrition`).

### 4.1 Food catalog

```
foods
  id, source ('usda_foundation'|'usda_sr'|'usda_branded'|'partner'|'igu_staff'|'custom'|'recipe'),
  fdc_id (nullable), upc (nullable, indexed for barcode),
  restaurant_id (nullable FK → restaurants, set for source='partner'),
  name, brand (nullable), owner_user_id (nullable — set for custom foods; NULL = global shared),
  category_id (FK → food_categories), tags (text[] — cross-cutting: high-protein/vegan/gluten-free),
  approval_status ('approved'|'pending'|'rejected'), approved_by, approved_at,  -- Food Library Manager
  serving_default_g, is_verified (lab vs label vs partner vs user), is_active, cached_at (branded),
  search_tsv (full-text)
  -- client search shows only approval_status='approved' global rows + the caller's own custom foods

food_categories         -- browse taxonomy (§4.1b), admin/dietitian-editable
  id, name, parent_id (self-FK, 2 levels), sort_order, icon

restaurants             -- partner/collab identity (source='partner' foods link here)
  id, name, logo_url, partnership_status ('active'|'paused'),
  approved_by, approved_at, notes     -- provenance of the permission/collab

food_nutrients          -- per-100g, one row per (food, nutrient)
  food_id, nutrient_id, amount_per_100g
  -- OR: a nutrients JSONB column on foods if we keep the panel fixed.
  -- Recommend a normalized table so the dietitian micro panel can grow.

nutrients               -- reference: id, name, unit, category (macro|micro),
                        --   fdc_nutrient_number, display_order, coach_visible (bool)
                        -- coach_visible=false for micros → drives role-layered read.

food_portions           -- named measures per food
  food_id, label ('1 cup', '1 breast', '1 slice'), gram_weight,
  unit_kind ('mass'|'volume'|'serving'), ml_equiv (nullable — enables ml/L for this food)
```

**Units (D6) — log by g / kg / ml / L / serving.** Nutrition is stored per-100g, so every entry
resolves to **grams** before math:
- **Mass** — `g` direct; `kg` = ×1000. Always available for every food.
- **Volume** — `ml` / `L` available when the food has a density (`ml_equiv` / a volume
  `food_portions` row); grams = `ml × density`. Liquids (milk, oil, juice) ship with density from
  USDA volume portions; solids without a density don't offer ml/L.
- **Servings** — household measures from `food_portions` ("1 breast", "1 scoop", "1 slice").
- The unit picker shows only the units valid for that food, with a sensible default (last-used
  per food, else the food's default serving). Goal: **fewest taps, most adaptable** — a coach's
  client can log "180 g chicken", "1 scoop whey", or "300 ml milk" without friction.

### 4.1b Food taxonomy — categories (browse & build like the exercise library)

The exercise library has a structured breakdown (body region → muscle → subdivision → movement) that
powers the browse/pick UI and the swap logic. **Food needs the same** — a category taxonomy so foods
are browsable by type, not just searchable by name. This is what lets a **dietitian build a meal-plan
template the way a coach builds a workout** (browse "Lean protein", pick chicken; browse "Complex carbs",
pick oats), and it lets a client browse when they don't know the exact name.

**Two-level taxonomy** (`food_categories`: `id, name, parent_id, sort_order, icon` — admin-editable, same
pattern as `specialization_tags` / the exercise taxonomy). Foods carry a **primary `category_id`** (+
optional secondary tags for cross-cutting labels like "high-protein", "vegan", "gluten-free"). A
representative starter set (editable in the Food Library Manager):

| Category | Subcategories (examples) |
|----------|--------------------------|
| **Protein** | Poultry · Red meat · Fish & seafood · Eggs · Dairy protein · Plant protein · Protein supplements |
| **Carbs** | Grains & cereals · Bread & bakery · Rice & pasta · Starchy veg (potato) · Legumes |
| **Vegetables** | Leafy greens · Cruciferous · Other vegetables |
| **Fruits** | Fresh · Dried |
| **Fats** | Oils & butters · Nuts & seeds · Avocado & olives |
| **Dairy** | Milk & yogurt · Cheese |
| **Snacks & sweets** | Bars · Chocolate/confectionery · Chips/crackers |
| **Beverages** | Water/soft drinks · Juices · Coffee/tea · Alcohol |
| **Condiments & sauces** | Dressings · Spreads · Cooking sauces |
| **Prepared & restaurant** | Recipes · Partner/restaurant items |
| **Supplements** | Vitamins · Minerals · Performance |

- **Seeded from USDA on ingestion.** USDA foods carry a food group / category, so bulk ingest can
  **auto-assign a first-pass `category_id`**; staff refine in the Food Library Manager. Partner/restaurant
  and staff-added foods get a category at import/create time.
- **Browse UI reuses the exercise pattern.** The food search sheet gets a **category accordion**
  (category → subcategory → foods) exactly like `SessionAddPicker`'s body-region accordion — so "browse
  by type" sits next to "search by name" and "Recent / Frequent".
- **Swap parallel (later):** because foods are categorised, a meal-plan item can offer **"swap within
  category"** (swap chicken for another lean protein), mirroring the exercise swap. Nice-to-have for the
  meal-plan builder, not v1 logging.
- **Managed in the Food Library Manager** — the same admin/dietitian surface curates the taxonomy and
  each food's category assignment.

### 4.2 Custom foods & recipes

- **Custom foods** — `foods.source = 'custom'`, `owner_user_id = client`. Client-entered
  macros (+ optional micros).
- **Recipes** — a composed food. `foods.source = 'recipe'` header + `recipe_ingredients`
  (food_id + quantity_g), nutrition computed from ingredients (Cronometer-style: recipe uses
  the same entry UI, can be exploded into ingredients inline). Support **final cooked weight**
  for water-loss accuracy. Recipes are owner-scoped; later a coach/dietitian could share
  recipes to a client.

### 4.3 The diary

```
food_log_entries
  id, client_id, log_date, meal_slot ('breakfast'|'lunch'|'dinner'|'snack'|custom),
  logged_at (time), food_id,
  quantity, unit ('g'|'kg'|'ml'|'l'|'serving'), quantity_g (normalized — drives all math),
  -- denormalized snapshot at log time so later food edits don't rewrite history:
  kcal, protein_g, fat_g, carb_g, (micros JSONB snapshot),
  source_note, created_by (client|coach|dietitian)

food_log_daily_rollup   -- materialized/derived per (client_id, log_date)
  total_kcal, total_p/f/c, micros JSONB, entry_count
  -- vs the active nutrition_goals target for that date → adherence delta.
```

Meal slots are configurable (MFP-style fixed meals by default; allow custom blocks like
Cronometer Gold). Denormalizing macros/micros onto each entry is deliberate — food records
change (branded re-pulls, recipe edits) and the diary must be an immutable historical record.

### 4.4 Role-layered read model (the distinctive part)

Same log, three depths:

- **Client** — full own logs (read/write).
- **Coach** — **calories + macros only**. No micronutrients.
- **Dietitian** — **full logs + micronutrient breakdown**.
- **Admin** — full.

Implementation options (decide at build time — see Open Decisions):

- **A. Column/nutrient gating via a view + RPC.** A `coach_visible` flag on `nutrients`;
  a `get_client_daily_nutrition(p_client_id, p_date)` SECURITY DEFINER RPC that returns the
  macro-only shape to coaches and the full shape to dietitians (branch on
  `is_dietitian_for_client` / `is_care_team_member_for_client`). Micros never leave the DB
  for a coach. Cleanest for the "coach literally cannot see micros" guarantee.
- **B. RLS row policies only.** Simpler but can't hide *columns* (micros) from a coach who can
  read the row — so A (RPC-shaped payloads) is the likely answer for the macro/micro split.

Reuse the existing precedence: `can_edit_nutrition(actor, client)` already encodes
Admin → Dietitian → Coach → Self and flips the coach to read-only when a dietitian is assigned.
The read model should mirror that vocabulary so nutrition permissions stay consistent app-wide.

### 4.5 Feeding adherence + goals math (D3)

- Daily rollup vs the active `nutrition_goals` target → a **real adherence signal**
  (kcal delta, macro deltas) replacing the guessed/estimated/weighed self-report.
- `tracking_accuracy` becomes **derivable** ("weighed" ≈ logged most days) rather than asked.
- The weekly check-in (`adherence_logs`) can, over time, be **auto-populated** from logs and
  the coach roster adherence % (`get_coach_roster_stats`) fed from actual intake. Sequence this
  carefully — the check-in math and `expected-vs-actual` strip are load-bearing across the coach
  UI; migrate behind a flag, keep the self-report as fallback for clients who don't log.
- **Do NOT reimplement BMR/TDEE/macro math** — targets still come from
  `calculateNutritionGoals()`. Food logging only supplies the *actual intake* side of the
  comparison.

### 4.6 Nutrition adherence model — calorie band + tiered macro alerts (DECIDED 2026-07-05)

Logging turns adherence from a self-reported feeling into a **measured deviation from target**. The
day view / dashboard "Food diary" feed the weekly **History & trends**.

**Adherence band = calories (D7, D8).** Each day (and the **7-day rolling** average — the headline the
coach sees) resolves to a band on **calorie deviation from target**:

| Band | Meaning | Tone |
|------|---------|------|
| **Adherent** | calories within **±10%** of target | green (`status-ontrack`) |
| **Slightly off** | within **±20%** | amber (`status-attention`) |
| **Off track** | beyond ±20%, or **not logged** | red (`status-risk`) |

Thresholds are **fixed platform defaults now, coach-overridable later** (D7 hybrid — a later slice adds
`nutrition_phases.adherence_tolerance_pct`; the band function reads the override if present, else the
default). Crossing into *Off track* (or a multi-day slide) raises a coach alert (reuse the
`process-inactive-client-alerts` / roster-attention machinery) and can nudge the client. This **retires
the self-report**: `tracking_accuracy` becomes derivable ("weighed" ≈ logged most days); migrate
`get_coach_roster_stats` behind a flag with the self-report as fallback for clients who don't log.

**Macro alerts — separate from the band, TWO tiers of prominence (D8).** The band is calorie-based, but
when a **macro is off its prescription** we alert, and **protein + calories alert loudly; fat + carbs
alert quietly**:

| Tier | Macros | When | Treatment |
|------|--------|------|-----------|
| **Loud** | **Calories, Protein** | off target beyond the alert tolerance (multi-day) | prominent banner/badge — filled tone color + icon, a **coach notification**, and a client-facing nudge |
| **Quiet** | Fat, Carbs | off target | subtle inline chip / muted note on the nutrition surface — no push, no banner |

- **"Off prescription" tolerance** for a macro ≈ **±15%** of its gram target over a rolling window
  (tunable, defaults fixed like the calorie band). Protein is typically flagged on the **under** side
  (a floor); calories on both sides.
- **Where alerts show:** loud alerts appear on the **coach intake panel** (screen 6, top) AND mirror to
  the **client** day view / Food-diary card so the client sees the same nudge; quiet alerts are inline
  chips on the macro summary only. Dietitian sees these plus the micro panel.
- Rationale: protein and total calories are what actually drive a coaching outcome, so they earn the
  attention; fat/carb split is informational unless the coach digs in.

---

## 5. UX shape (from competitor study)

Learnings from MyFitnessPal (speed, crowdsourced breadth, meal structure) and Cronometer
(lab accuracy, full micros, unified recipe/entry UI). Reference **Mobbin** for interaction
patterns when designing.

- **Fast entry is the whole game.** Search → recent/frequent foods row → quick-add. Log in
  as few taps as possible. Mirror the Planning Board's mobile pattern: vaul `Drawer` composer,
  `h-10 text-base` inputs, `useIsMobile()` branch.
- **Diary screen** — day header with kcal/macro **rings** (target vs consumed), meal sections
  (breakfast/lunch/dinner/snacks), running daily totals, swipe/tap to edit or delete entries.
- **Search UX** — verified (lab) vs branded (label) vs user badges; "Recently used" and
  "Frequent" rows; portion/serving picker with household measures + grams.
- **Barcode** — browser camera via `BarcodeDetector` API where supported, `@zxing/browser`
  fallback (iOS Safari lacks `BarcodeDetector`). UPC → FDC branded lookup → cache. Purely
  additive; typing a food never requires the camera.
- **Recipes** — same entry UI as the diary; build once, log the whole recipe or explode into
  ingredients inline; cooked-weight adjustment.
- **Coach surface** — new depth inside the existing Client Overview `nutrition` tab
  (`?tab=nutrition`): daily/weekly intake vs target, adherence from real data, macro trend.
  Macros only.
- **Dietitian surface** — the full log + micronutrient panel; this is where the parked
  **Dietitian dashboard** idea plugs in (its own working surface, scoped to nutrition).

Follow IGU UI rules: `ClickableCard` (never `<Card onClick>`), `pb-24 md:pb-8` on any
standalone page, 44px touch targets, label maps for enums (never `.replace()`), i18n
namespaces.

---

## 6. Phases (how parity ships in slices)

Parity is the destination; these are shippable increments, each independently useful.

- **Phase 0 — Data foundation.** `foods` / `nutrients` / `food_nutrients` / `food_portions`
  schema + RLS. USDA Foundation + SR Legacy bulk ingestion + normalization (per-100g, portions,
  micro panel). FDC API client (edge function) for search + UPC lookup + cache-on-use. No UI.
- **Phase 1 — Client diary (generic + custom).** Diary schema (`food_log_entries`,
  daily rollup). Search + recent/frequent + portion picker + quick-add. Meal sections + rings.
  Custom foods. Web-first, mobile-optimized. (No barcode, no branded yet.)
- **Phase 2 — Recipes.** Composed foods, ingredient explode, cooked-weight. Recipe reuse in diary.
- **Phase 3 — Branded foods (search).** On-demand FDC branded name search + cache-on-use.
  _(Barcode scanning deferred — later optional slice.)_
- **Phase 4 — Role-layered coach/dietitian read.** `get_client_daily_nutrition` RPC (macro
  vs full shapes) + `coach_visible` nutrient flag. Coach intake-vs-target inside the nutrition
  tab; dietitian full log + micro panel. (Feeds the Dietitian dashboard idea.)
- **Phase 5 — Adherence integration (D3).** Rollup → real adherence signal; derive
  `tracking_accuracy`; feed coach roster adherence behind a flag with self-report fallback.

Phases 0→3 are the client-facing product; 4→5 are the coaching integration and are where this
intersects the specialist/dietitian arc.

---

## 7. Open decisions & remaining gaps

**Resolved (this planning cycle):** DB source = USDA FDC (CC0); generic bulk + branded cache-on-use +
partner restaurants + staff curation; unified `NutritionSummary`; food logger lives in the Nutrition
section, persistent nav; units g/kg/ml/L/serving (D6); barcode deferred (D2); adherence = calorie band,
hybrid thresholds (D7) + two-tier macro alerts (D8); food taxonomy (§4.1b); dietitian integration
contract (Part IX); approved shared catalog + Food Library Manager.

**Locked (2026-07-05 — defaults accepted, build-ready):**

| # | Decision | Locked choice |
|---|----------|---------------|
| 1 | Nutrient storage | **Normalized `food_nutrients` table** (lets the micro panel grow) |
| 2 | Micro panel breadth | **Store the full USDA panel; display a curated subset**, dietitian can expand |
| 3 | Role-gating mechanism | **RPC-shaped payloads (option A)** — coach payload literally omits micros |
| 4 | Branded cache policy | Cache-on-use + a **~30-day refresh** for stale branded rows |
| 5 | Macro-alert tolerance | **±15%** of a macro's gram target over a rolling window (protein flagged on the under-side) |
| 6 | Food Library curators | **Admin + approved dietitians** |
| 7 | Staff log-on-behalf | **Yes**, with `created_by` audit — coaches/dietitians can log for a client |
| 8 | Offline logging (PWA) | **Later slice** — IndexedDB queue → sync; not v1 |
| 9 | Quick-add calories | **Include** — log a bare kcal/macro number without a food (for eating out) |
| 10 | Water tracking | **Out of v1** — easy to add later |
| 11 | Arabic food names (i18n) | **Partner/staff foods can carry Arabic names**; USDA generics stay English in v1 |

Nothing above blocks the build. The **History & Trends** screen (previously the last spec gap) is now
written — see Part V screen 9.

---

## 8. Dependencies, intersections, risks

**Depends on / intersects:**
- **Specialist parity** (`docs/SPECIALIST_PARITY_BUILD.md`) — gives dietitians the role,
  care-team presence, and gating this read model rides on.
- **Dietitian dashboards** (parked, `docs/FOR_LATER.md`) — consumes the full-log + micro data
  from Phase 4. Plan that idea *after* this one; it's downstream.
- Existing nutrition math (`nutritionCalculations.ts`), `nutrition_goals`, `adherence_logs`,
  `get_coach_roster_stats`, the Client Overview nutrition tab.

**IGU-specific risks / gotchas (from CLAUDE.md):**
- Every SECURITY DEFINER RPC needs the **REVOKE FROM PUBLIC/anon → GRANT** pattern; PHI-style
  care about who can read what.
- Food logs are **health-adjacent** — treat with the same PII/PHI discipline as the rest of
  nutrition; keep them out of any surface a plan-client / non-care-team viewer can reach.
- **Never nested-FK-join** through `profiles` / `subscriptions` — separate queries.
- Per-100g vs per-serving vs volume normalization is the classic food-DB footgun — normalize to
  grams on ingest AND on log; ml/L needs a per-food density (only offer volume when we have it);
  test fat-% minced-beef variants and a liquid (milk by ml vs g) explicitly.
- Denormalize nutrition onto each log entry so branded re-pulls / recipe edits don't rewrite
  logged history.
- Barcode is deferred, but keep the `upc` column so it can drop in later without a migration; when
  it returns, `BarcodeDetector` is unsupported on iOS Safari so it'll need a `@zxing/browser` fallback.

---

---

# PART IV — Design language (coherence with the site)

Mockups live in `docs/FOOD_LOGGING_MOCKUPS.html`. They use the **real IGU tokens** so the food
logger looks native, not bolted-on. Anchors (from `src/index.css` + `tailwind.config.ts`, light mode):

| Token | HSL | Use |
|-------|-----|-----|
| `--background` | `220 20% 97%` | app background (off-white) |
| `--card` | `0 0% 100%` | flat white cards — **no shadow** (DS1 foundation) |
| `--primary` | `355 78% 48%` | IGU crimson — primary CTAs, active states |
| `--border` | `220 15% 92%` | hairline borders |
| `--radius` | `0.75rem` | card / control radius |
| `--muted-foreground` | `240 3.8% 46.1%` | secondary text |
| `--macro-protein` | `0 72% 51%` (red) | protein everywhere |
| `--macro-fat` | `38 92% 50%` (amber) | fat everywhere |
| `--macro-carb` | `217 91% 60%` (blue) | carbs everywhere |
| `--status-ontrack / attention / risk` | green / amber / red | adherence + insight tone |

**Type:** Geist (body), Bebas Neue (`font-display`, big numeric heroes like the kcal count),
JetBrains Mono (`font-mono`, the expected-vs-actual strips — reuse the `NutritionPhaseCard` idiom).
`font-bold` is capped at 600 — no heavy weights.

**Cards (match `src/components/ui/card.tsx` exactly):** `Card` = `rounded-lg` (**12px / `--radius`**),
1px `border`, `bg-card`, **no shadow** (flat, DS1). **`CardTitle` = `font-medium` (500)** + `tracking-tight`
(NOT 600). `CardHeader` / `CardContent` = `p-4 md:p-6`. Use the primitive; don't hand-roll a card.

**Theme (2026-07-05):** the app ships a **light/dark toggle, default dark** — **every surface follows
the theme via tokens** (`:root` light / `.dark` dark; `src/index.css`). Build from token vars
(`hsl(var(--card))`, `--foreground`, `--macro-*`, `--status-*`), **never pinned HSLs**, so all of these
nutrition surfaces flip for free. No dark-locked surfaces.

**Reused idioms (verified against the live components — `NutritionPhaseCard`, `NutritionTargetsCard`,
`MacroDistributionRibbon`, `MacroDonut`):**
- **Calories are a big number, not a progress ring.** IGU renders kcal as a `font-display` / crimson
  numeral (in a `bg-primary/5` rounded box on the targets card) — there is **no consumer-style
  "kcal-left" circular gauge** anywhere. The food-log day view uses the same: big crimson number +
  a thin linear `progress` bar for consumed/target.
- **Macro split** = the thin `MacroDistributionRibbon` (h-2 rounded, muted track, mono P/F/C labels
  below) or the **`MacroDonut`** (arcs split by *calorie contribution*, legend keeps grams + %).
  The donut is a split, not a fill gauge.
- **3-col macro grid** in `bg-muted/50 rounded-lg` cells (grams `font-semibold tabular-nums` + label +
  %) — the targets-card pattern, reused for consumed-vs-target.
- **`w-1` status rail** on the phase card; **outline status badges** (`border-status-x/40
  bg-status-x/10 text-status-x`); **mono `tabular-nums` stat strips** with `border-t` (expected/actual);
  `Button` `size="sm"` `variant="outline"|"ghost"` with small lucide icons; `ClickableCard` for tappable
  cards; vaul `Drawer` for mobile composers.

The mockups (`docs/FOOD_LOGGING_MOCKUPS.html`) were **rebuilt from these components**, not from token
values alone — v1 used consumer-app rings that don't exist in IGU and were removed.

### One unified calorie + macro display (`NutritionSummary`) — non-negotiable

**Every place that shows calories + a macro breakdown uses the SAME component, at different sizes.**
This is the biggest coherence lever — MyFitnessPal / Cronometer feel unified precisely because a
day total, a food item, and a recipe all render their calories + macros identically. IGU today is
*not* unified (the phase card uses number + ribbon; the targets card uses number + ribbon + a 3-col
grid; NU7 uses a donut). We consolidate all of it into one primitive and reuse it everywhere.

**`NutritionSummary`** — a single object:
- **Macro-split donut** (arcs = calorie contribution P·4 / F·9 / C·4, the existing `MacroDonut` math),
  with the **calorie number centered inside** (`font-display`, crimson). One object carries both
  "how many calories" and "what's the macro split".
- **A spacious legend** — Protein / Fat / Carbs, each on its **own row** with a color swatch, the
  grams, and the % in **aligned columns** (name left; grams + % right, mono, `tabular-nums`). Room to
  breathe — the v2 cramped grams/% is fixed by giving each value its own column and generous line-height.
- **Sizes:** `lg` (day total, nutrition-home hero), `md` (food detail, recipe per-serving, coach
  intake hero), `sm` (dashboard widget, meal roll-up). Same layout and type ramp at every size.
- **Target context (only when a target exists):** the centered number reads `1,480 of 2,050`, the
  legend grams read `124 / 172 g`, and a **single thin progress bar** sits beneath. A food item (no
  target) simply omits the target text and the bar — same component, fewer props. No second "way".

**Rule for the build:** never introduce a bespoke calorie/macro visual. If a surface shows calories +
macros, it renders `NutritionSummary`. The ribbon and standalone donut are retired into it, and the
existing `NutritionPhaseCard` / `NutritionTargetsCard` are refactored onto it as part of this work
(they keep their surrounding chrome — status rail, mono expected/actual strip — but the calorie+macro
block becomes the shared summary). Type ramp is fixed centrally here so nothing looks off-size.

**What we deliberately DON'T copy from competitors:** MFP's "calories remaining = goal − food +
exercise" (IGU targets are coach-set phases, not a subtract-exercise budget); gamified streaks;
ad-driven upsells. We keep the coaching frame — intake is measured *against the coach's phase target*.

---

# PART V — Screens (Mobbin-informed, IGU-styled)

Eleven screens, mocked in the HTML file. The food logger is **a view inside the client Nutrition
section** — not a separate Diary destination (D5). Each screen notes its reference and the IGU spin.
(Screens 1–8 client/coach/dietitian; 9 History & Trends; 10 meal-plan builder; 11 Food Library Manager.)

### 1. Client — Nutrition → Food log (day view)  _(ref: Lifesum hero ring, MFP diary sections)_
- Reached from the Nutrition section (its default "Today" surface). Sticky day header with
  `< Today >` date stepper + weekday dots.
- **Hero kcal ring** — consumed vs coach target (crimson arc, Bebas numeral, "X left" / "X over").
  Under it, the P/F/C strip (red/amber/blue) as `consumed / target g` with thin progress bars.
- **Meal sections** — Breakfast / Lunch / Dinner / Snacks (configurable). Each: section kcal on the
  right, logged entries (name · portion · kcal), and a full-width `+ Add food` row.
- FAB `+` (crimson) → quick-add sheet. Entry row → tap to edit portion, swipe/kebab to delete.
- Empty state per meal: "Nothing logged yet."

### 2. Client — Add food · search  _(drawer over Nutrition; ref: Ultrahuman per-100g results, MFP tabs)_
- Slides up as a vaul `Drawer` — the bottom nav stays visible behind it.
- **Plan recommendations pinned to the top.** When the client opens the picker **for a meal that has a
  plan slot**, that slot's recommended foods (auto-sized to the target) surface in a **"From your plan"**
  section **above** search / Recent / Frequent — so logging a recommended item is one tap. The plan
  pushes its picks up; everything else is still one search away (stays a recommendation, not a cage).
- Search field (no barcode in v1). Segmented: `All · Recent · Frequent · My foods · Recipes`.
- **Browse by category** (§4.1b): a category accordion (Protein → Poultry → foods …) sits alongside
  search, reusing the `SessionAddPicker` body-region-accordion pattern — for when the client would
  rather browse a food type than type a name.
- Result rows: name, verified/branded/custom badge, `Per 100g · 210 kcal · P 31 F 4 C 0`. `+` quick-adds
  a default serving; tap row opens detail. "Recently used" and per-food `×N` frequency, mirroring the
  Planning Board add-picker vocabulary.
- Empty-search state handled (never `matching ""`).

### 3. Client — Food detail / portion + units  _(drawer over Nutrition; ref: Lifesum serving selector, MacroFactor impact-on-targets)_
- Food name + source. **Unit + amount picker (D6):** a unit chip row — **g · kg · ml · L · serving**
  (only units valid for that food shown) + a quantity stepper/keypad. Volume units appear only for
  foods with a density; servings come from `food_portions`. Nutrition recomputes live.
- Macro rings (P/F/C %) + kcal. **"Impact on today's targets"** mini-rings (how this entry moves the
  day toward the coach target — the coaching-native version of MacroFactor's panel).
- Meal-slot selector + `Add to log` (crimson). Defaults to the last-used unit for that food.

### 4. Client — Recipe builder  _(ref: Cronometer unified entry, Bevel ingredients)_
- Recipe name, servings, **ingredient list** (each = food + quantity, uses the same search/detail).
  Per-serving nutrition computed live. **Final cooked weight** field for water-loss accuracy. Save →
  becomes a `source='recipe'` food, loggeable like any other.

### 5. Client — Nutrition section (`/nutrition`) home
- The Nutrition section holds both the coach's plan and the client's log. Landing shows a **"Today"
  card** (mini kcal ring + macro strip + `Log food` → the food-log day view) above the existing
  phase/goal view. This is where the food logger lives — no separate Diary route (D5). Ties the
  coach's targets to the client's actuals on one screen.

### 6. Coach — Client Overview → Nutrition tab  _(macros only)_
- New **Intake** panel inside `?tab=nutrition`: logged intake vs phase target per day/week, macro
  adherence from **real data**, a 7-day intake-vs-target bar. **No micronutrients** — coach payload is
  macro-only by construction (Part III §4.4). Feeds the adherence signal (Part III §4.5).

### 7. Dietitian — full log + micronutrient panel  _(ref: MFP nutrients table, Bevel targets/limits)_
- Everything the coach sees **plus** the micro breakdown: per-nutrient `consumed / target` with
  over/under coloring, split "meet or exceed" vs "stay under" (Bevel idiom). Per-entry drill-down.
  This is the dietitian-distinctive surface and the seed of the future **Dietitian dashboard**.

### 8. Client dashboard — "Food diary" card
- Titled **Food diary** (not "Log food"). Unified summary + a **`+`** quick-log (same affordance as the
  diary FAB) + a **"View history & trends"** link. Opens the Nutrition food log. Nudges daily logging.

### 9. Client — Nutrition › History & Trends  _(reuse `PhaseAnnotatedTrendChart`)_
- The Nutrition section's **History** tab (Today / Plan / **History**). This is where logging pays off
  over time. Duration toggle (M / Q / 6M / Y / All), phase-annotated bands (reuse
  `PhaseAnnotatedTrendChart` from the coach-client redesign — shaded phase bands + boundary lines).
- **Panels:** (a) **kcal intake vs target** trend line; (b) **adherence over time** — a strip of daily
  band dots (green/amber/red) + the rolling adherent-% ; (c) **macro trends** (protein/fat/carbs vs
  target, multi-series); (d) a compact **streak / days-logged** stat. Weight/measurement trends already
  live in the existing nutrition history — this adds the *intake* side beside them.
- Same on the coach side inside the Nutrition tab's History sub-tab (macro-level); the dietitian adds
  micronutrient trends.

### 10. Dietitian — Meal-plan builder  _(build a meal like a workout; detail in Part IX)_
- Browse the **food taxonomy** (§4.1b) by category, drop items into meals (Breakfast/Lunch/…), see the
  plan's per-day `NutritionSummary` update live; save as a reusable template, assign to a client.
  Swap-within-category on items. Same catalog + unit model as logging.

### 11. Admin — Food Library Manager  _(curation; detail in Part III / Part VI)_
- List/search the shared catalog with **source + approval** filters; add/edit a food (portions +
  nutrients + category); **approve** pending items; a **promotion queue** for client custom foods; a
  **partner menu import**. Provenance badge on every row. Mirrors `WorkoutLibraryManager`.

---

# PART VI — Related-page & wiring changes (nothing ships orphaned)

**Navigation stays as-is (D5) and always persists.** Client nav = **Dashboard · Nutrition · Workout ·
Learning · More**. **No new nav item, no `/diary`.** The food logger is a surface *inside* the existing
Nutrition section — reached from `/nutrition` (and from the dashboard). Crucially, **the bottom nav is
present on every food-log surface** — nothing goes full-screen-chromeless. Food **search** and **food
detail** are **vaul `Drawer`s that slide up over the Nutrition page** (not route changes), so the nav
stays visible behind them; the day view, recipe builder, and nutrition home are pages inside
`ClientLayout`, which renders the persistent dock. (The only place IGU hides the dock today is the
distraction-free workout logger — food logging does NOT do that.)

**Dashboard = "Food diary" (D5a).** The client dashboard card is titled **Food diary** (not "Log
food"); tapping it opens the diary, a **`+`** button on the card is the quick log-food action (same
affordance as the diary's FAB), and a **"View history & trends"** link connects the day's log to the
weekly history/trends surface. So "logging food" and "seeing my diary/trends" are one coherent object
across dashboard → Nutrition section.

| Area | File(s) | Change |
|------|---------|--------|
| **Nutrition section** | `/nutrition` client page | Becomes the home for food logging: add the "Today" food-log surface (Screens 1 + 5) — day view, meal sections, search, food detail. Likely an inner tab/segment ("Today" / "Plan") rather than a new route. |
| **Client dashboard** | `ClientDashboardLayout` / dashboard | Add the **"Food diary"** card (Screen 8): unified summary + a `+` quick-log + "View history & trends" link; opens the Nutrition food log. |
| **Coach nutrition tab** | `src/components/client-overview/tabs/NutritionTab.tsx` | Add the **Intake** panel (Screen 6), macro-only, gated read via new RPC. |
| **Dietitian view** | NutritionTab (dietitian branch) / future Dietitian dashboard | Micro panel (Screen 7), gated to `is_dietitian_for_client` / care-team. |
| **Food Library Manager** | new `src/pages/admin/FoodLibraryManager.tsx` (mirrors `WorkoutLibraryManager`) | Admin/dietitian surface to add/edit/**approve** shared foods, set source/provenance, promote client custom foods, import partner menus. New admin route + `AdminMobileNavGlobal` prefix. |
| **i18n** | `src/i18n/locales/{en,ar}/*` | New `nutrition` keys; RTL check on rings + bars + unit chips. |
| **routeConfig / docks** | — | **No change.** No route added; `/nutrition` already in the client nav + mobile dock prefix list. |

**Guard/permission notes:** food logs are client-self data reached via the existing `/nutrition`
route (already `AuthGuard`-wrapped). The coach/dietitian read of a client's logs reuses
`can_edit_nutrition` precedence + `is_*_for_client` helpers. Any new SECURITY DEFINER RPC
(`get_client_daily_nutrition`, `search_foods`, `log_food_entry` batch) follows the
**REVOKE FROM PUBLIC/anon → GRANT** pattern. Plan-clients (future marketplace idea) must be excluded
from every food-log surface.

---

# PART VII — Component inventory (new)

**`NutritionSummary` (the unified calorie+macro primitive — build this first, use it everywhere).**
Sizes `lg | md | sm`; props `{ calories, protein, fat, carbs, target?, showProgress? }`. Consolidates
`MacroDistributionRibbon` + `MacroDonut` and is adopted by `NutritionPhaseCard` / `NutritionTargetsCard`.

Client: `FoodLogDayView`, `MealSection`, `FoodLogEntryRow`, `FoodSearchSheet`, `FoodResultRow`,
`FoodDetailSheet`, `UnitAmountPicker` (g / kg / ml / L / serving — food-aware unit set), `RecipeBuilder`,
`RecipeIngredientRow`, `TodayNutritionCard` (dashboard + `/nutrition`). All calorie/macro rendering
goes through `NutritionSummary` — no bespoke ring/ribbon/grid.

Coach/dietitian: `IntakeVsTargetPanel` (macro-only), `MicronutrientPanel` (dietitian), `NutrientRow`
(consumed/target + tone).

Admin/curation: `FoodLibraryManager` (list/search/filter by source + approval status), `FoodEditForm`
(add/edit a food + portions + nutrients), `FoodApprovalQueue` (pending custom-food promotions),
`PartnerMenuImport` (CSV → `foods` under a restaurant). Hook: `useFoodLibraryAdmin`.

Hooks: `useFoodSearch` (local + FDC-API-cached), `useFoodLogDay(clientId, date)`,
`useDailyNutrition(clientId, date)` (role-shaped), `useRecipes`, `useUnitConversion(food)`.

Edge functions: `fdc-food-search` (branded proxy + cache). Seed script: `ingest-usda-foundation`
(bulk CSV → `foods`/`food_nutrients`/`food_portions`, incl. volume portions → density for ml/L).
_(Barcode: `fdc-barcode-lookup` + a scanner component are a deferred later slice.)_

Reuse: `ClickableCard`, vaul `Drawer`, `useIsMobile`, `MetricCard`, `DeltaChip`, sonner toasts,
`calculateNutritionGoals` (targets only).

---

# PART VIII — Detailed phasing (build order)

Refines Part III §6 into buildable slices. Each phase is independently shippable and testable.

- **P0 — Data foundation & ingestion.** Schema (`foods`, `food_categories`, `nutrients`,
  `food_nutrients`, `food_portions`, `recipes`/`recipe_ingredients`, `food_log_entries`, rollup) + RLS.
  USDA Foundation+SR Legacy bulk ingest + normalization, **auto-assigning `category_id` from USDA food
  groups** (§4.1b). `fdc-food-search` edge fn with cache-on-use. No UI. _Verify: search returns generic
  foods with correct per-serving math and a sensible category._
- **P1 — Client food log MVP (inside Nutrition).** Food-log surface in the `/nutrition` section
  (no new route). Day view, hero ring, meal sections, search + result rows + quick-add, food detail
  with the **g/kg/ml/L/serving unit picker (D6)**, custom foods. Web-first, mobile Drawer.
  _Verify: log the same food by grams and by serving and get matching totals; ring + macro strip update;
  edit/delete an entry._
- **P2 — Recipes.** Recipe builder, ingredient explode, cooked-weight; recipes loggable.
- **P3 — Branded foods (search).** FDC branded name search + cache-on-use.
  _Verify: a branded search result logs with correct per-serving math. (Barcode deferred.)_
- **P3b — Partner / restaurant menus.** `restaurants` table + admin import tool; partner foods as
  global rows with a brand badge + a "Restaurants" search facet. _Verify: an approved restaurant item is
  searchable by every client and logs correctly; a discontinued item soft-deletes without breaking past
  logs._
- **P3c — Food Library Manager (curation).** Admin/dietitian interface: add/edit/approve shared foods,
  `approval_status` + provenance, promote client custom foods, partner CSV import. _Verify: only
  `approved` global rows appear in client search; a promoted custom food becomes visible to all clients;
  a non-admin/non-dietitian cannot write._
- **P4 — Coach & dietitian read (role-layered).** `get_client_daily_nutrition` (macro vs full shapes)
  + `nutrients.coach_visible`. Coach Intake panel; dietitian micro panel. _Verify: a coach payload
  contains zero micro fields; a dietitian payload contains the full panel._
- **P5 — Adherence integration.** Rollup → real adherence signal; derive `tracking_accuracy`; feed
  `get_coach_roster_stats` behind a flag with self-report fallback. _Verify: roster adherence matches a
  hand-computed intake-vs-target for a seeded client; flag-off path unchanged._
- **P6 — Dashboard + `/nutrition` widgets, i18n/RTL, polish, offline (optional).**

Dependency: P4/P5 assume **Specialist parity** (`docs/SPECIALIST_PARITY_BUILD.md`) has landed the
dietitian role + care-team gating.

---

---

# PART IX — Dietitian dashboards, recommendations & meal plans (integration points)

The **Dietitian dashboards** plan (`docs/DIETITIAN_DASHBOARDS_PLAN.md`) is the **co-owned companion** to
this doc — one connected nutrition system. This plan owns the food **data model**; that plan owns the
dietitian **build** (recommendations — supplements + meal-plan templates — the dashboard, the full-log +
micro surfaces). Here is the integration contract the dietitian build plugs into. **Naming: "recommendations", never
"prescriptions"** — IGU is a fitness/coaching platform, not a medical provider; "prescription" implies
clinical authority we don't want to claim. (This also matches the existing "recommendations" vocabulary
— `step_recommendations`.)

**The integration principle:** dietitian tools **author** on top of the same food catalog and **read**
the same logs. They don't fork the logging feature — they sit on both ends of it (author → the client
logs → dietitian reviews).

### 1. Meal plans — per-client, built from the same catalog, logged in one tap

- A **meal plan is per-client** (dietitian decision DD6 in `DIETITIAN_DASHBOARDS_PLAN.md` — **not** a
  generalized/reusable template library), authored on a **meal planning board** modeled on the workout
  planning board (mockups: `docs/MEAL_PLANNING_BOARD_MOCKUPS.html`).

**Meal planning board (structure = the workout board's Day → Session → Slot).**
- **Day → block → slot.** A day holds **blocks** typed **Meal / Snack** (the session analog; supplements
  deferred — see below): inline-renamable ("Meal 1" → "Lunch" / "Pre-workout"), reorderable,
  duplicate-to-day, each with a free-text **note** ("can switch with Meal 2", "pre-workout"). A meal block
  holds **category slots** (Protein / Carbs / Fat / Veg — the exercise-slot analog; a meal can have more
  than one of a category).
- **Slots are target-driven — the board does the math (the key refinement).** Instead of typing food
  grams, the dietitian sets a **target** for the slot as an **amount of a macro or calories** —
  `target_basis ∈ {protein_g, carb_g, fat_g, kcal}` + `target_value` (e.g. "40 g protein"). Then per food
  the **amount auto-computes** from the food's per-100g nutrition to hit the target (chicken 31 g P/100g →
  133 g delivers 40 g protein). No manual calculation. **Non-gram foods round to natural units** — 1 egg,
  1 scoop, 1 waffle, 1 cone, else "1 unit" (each food carries a unit gram-weight; auto-calc rounds to a
  whole unit). Each slot has a **mode**:
  - **Pick one** — the foods are **alternatives**, each auto-sized to the **full** target; the client
    picks one (e.g. 40 g protein from chicken 133 g / turkey 190 g / cod 210 g).
  - **Open** — no foods; the client chooses freely in that category (optional constraint note, "≥20 g
    protein").

  _(A "combine all" / multi-food-source mode was considered and dropped 2026-07-05 — doesn't make sense
  right now.)_
- **Schema sketch:** `client_meal_plans (client_id, name, phase_id nullable, day_count)` →
  `meal_plan_blocks (id, plan_id, day_index, type 'meal'|'snack', name?, note, sort_order)` →
  `meal_plan_slots (id, block_id, category_id, mode 'choose_one'|'open', target_basis, target_value,
  sort_order)` → `meal_plan_slot_foods (id, slot_id, food_id, computed_amount, unit)` (`computed_amount`
  derived from target + food nutrition).
  Duplicate-to-day within a client is fine; cross-client generalization is out.
- **Supplements deferred (2026-07-05).** No supplement block type on the board yet — the supplement
  *type* model (what supplements exist, dosing) needs its own pass. Per-client supplement
  **recommendations** still live as the separate simple list on the dietitian dashboard (Part IX §2); the
  target-calc board is meals + snacks only for now.
- **Live accumulation = the coach's volume readout, for nutrition.** As slots are filled, the board rail
  shows the **estimated daily kcal + macros** (`useMealPlanEstimate(day)`) and an accumulating
  **micronutrient** breakdown below (the parallel to `useMusclePlanVolume` + the day's sets/duration
  strip). Each day chip shows its est-kcal. **Estimate rule (locked):** for each pick-one slot the options
  hit the same target macro but differ in kcal, so the slot's estimate is the **average of its
  lowest-kcal and highest-kcal option**; sum those across slots for the day estimate, and show the
  **min–max range** (sum of lows → sum of highs) alongside. **The estimate EXCLUDES open slots** (they
  have no food yet) — surfaced with a dietitian-facing note ("excludes open slots"). The rail also shows a
  light **"placed vs phase target"** readout (P/F/C placed / target) so the dietitian can build toward the
  phase.
- **Phase link + over-target alert.** If the client has an **active phase**, the plan links to it
  (`phase_id`) and the rail compares the estimate to the phase target; going **over** raises an inline
  **alert** ("≈130 kcal over Summer Cut target — trim a carb option"). This reuses the adherence/target
  vocabulary (§4.6).
- **Client side — the plan lives in the Food logger, and logging matches the planner.** The client's
  Food diary shows the assigned plan's meals as its meal sections (same block names/notes). Per slot the
  client **picks one** option (which logs that food at its computed amount) or, on an **open** slot,
  **adds whatever they want** freely. **Every amount is adjustable** on log (the computed value is a
  prefill, not a lock). A "log remaining from plan" action logs the rest. So the logging UX is the same
  vocabulary the dietitian built with — pick-one / open / adjustable. See mockup screens 3–4.
- **The plan is a RECOMMENDATION, never forced logging (invariant).** A meal plan is optional guidance
  layered over the normal food logger — it **never blocks or replaces free logging**. On any plan item
  the client can edit/swap the food, and at any point they can **ignore the plan and log their own meal**
  from search (the standard diary "+ Add food" is always available alongside the plan). A client with no
  plan logs exactly as today; a client with a plan gets prefills they can accept, change, or bypass. The
  logger is always the client's — the plan just makes the common case one tap.

**Build-readiness (meal board).** Interaction details are now locked: target-driven auto-calc + natural
units, pick-one / open (no combine), estimate = avg(low,high) per pick-one slot + range, excludes open
slots, placed-vs-target readout, phase over-target alert, client adjustable, logger mirrors the planner.
The one hard prerequisite is that food logging **Phases 0–4** (catalog + per-100g nutrition + taxonomy +
role-layered read) land first — the board computes off that data. With that in place this is a
straightforward build off this section + `docs/MEAL_PLANNING_BOARD_MOCKUPS.html`.
- **Built via the food taxonomy (§4.1b), exactly like a workout.** The dietitian assembles meals by
  browsing categories (Protein → pick a lean protein; Carbs → pick a complex carb), the same
  browse-by-category flow the food picker uses — so building a meal plan feels like building a program.
  The category structure also enables **swap-within-category** on plan items (chicken ↔ another lean
  protein), mirroring the exercise swap.
- **Integration with logging = "log from plan" (the big win).** When a client has an assigned plan, the
  day view can **pre-fill the diary** from the plan; the client confirms or swaps items. Logging drops
  from "search every food" to "tap to confirm" — which massively lifts logging rates, which is what
  makes adherence data real. The plan's foods are literally the same catalog rows, so a planned item
  logs exactly like a searched one.
- **Adherence gains a second axis.** On top of the calorie band (§4.6), a plan-following client can be
  measured on **plan adherence** (ate the planned items / swapped / skipped). Same `NutritionSummary`
  and alert tiers apply.

### 2. Supplement recommendations — a light "food-like" item with its own adherence

- Dietitian issues **supplement recommendations** (e.g. "Creatine 5 g daily", "Vitamin D 2000 IU") to a
  client. Schema sketch: `supplements` catalog → `supplement_recommendations (client_id, supplement_id,
  dose, schedule, note, issued_by)` → `supplement_logs (client marks taken per day)`.
- **Integration with logging:** supplements are **checked off** in the same daily Food-diary surface (a
  small "Supplements" section under the meals) — a lightweight habit log, not a food search. Taking them
  feeds **its own adherence** signal (did they take what was recommended), surfaced to the dietitian.
- **Optional micro contribution:** a supplement that carries micronutrients (Vitamin D, iron, etc.) can
  **add to the daily micro totals** in the **dietitian** micro panel — so "iron trending low" accounts
  for a prescribed iron supplement. Coaches still see macros only; supplements don't add calories/macros
  unless the product does (e.g. a mass gainer, which is then just a branded food).

### 3. The dietitian dashboard = author + review, riding Phase-4 data

- **Review side:** the dashboard is where the **full log + micro panel** (screen 7 / Phase 4) lives at
  scale — the dietitian's roster of assigned clients, each with intake, micros, plan adherence, and
  supplement adherence. It reuses the role-layered read (`get_client_daily_nutrition`, dietitian shape).
- **Author side:** create/assign meal-plan templates and supplement recommendations, gated by
  `can_edit_nutrition` precedence (Admin → Dietitian → Coach → Self) and `is_dietitian_for_client` /
  care-team membership — the same gate the nutrition tab already enforces.
- **Coach boundary holds:** coaches see macro-level plan adherence but **not** micros or the supplement
  micro detail — consistent with the macro-only coach payload.

### 4. Sequencing

These build **after food-logging Phase 4** (role-layered read is the prerequisite). Meal-plan templates
reuse P0–P2 (foods/recipes) and the D6 unit model; supplement logging is a small parallel table. When we
plan the **Dietitian dashboards** FOR_LATER idea in full, it references this section as the contract with
the logging feature. Net: food logging is built so the dietitian layer snaps on without reworking it.

---

## Appendix — USDA FoodData Central references

- FoodData Central: https://fdc.nal.usda.gov/
- Downloadable datasets (bulk CSV/JSON): https://fdc.nal.usda.gov/download-datasets/
- API guide (key signup, rate limits): https://fdc.nal.usda.gov/api-guide/
- Foundation Foods documentation: https://fdc.nal.usda.gov/Foundation_Foods_Documentation/
- License: CC0 1.0 Universal (public domain).
