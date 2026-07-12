# IGU Design Track — Handover for a new Cowork design session

_Created 2026-07-12. Purpose: hand the **design-backlog master sheet** to a fresh Cowork coworker, bring them up to the CURRENT design bar (which has risen a lot since the sheet was written), and have them **reconcile + upgrade** the backlog against what's now shipped._

---

## 0. Your job, in one paragraph

`docs/IGU-Design-Changes-Master.xlsx` (the **"Design Changes"** tab) is IGU's design backlog — 119 rows from a Mobbin 10-app benchmark + a code read, done a while ago. Since then a large body of polished design work shipped (the coach-profile redesign, the whole testimonials/reputation system, the design-system foundation, public-page flattening). **The sheet is now stale in two ways:** (a) some "open" items are actually *done* under a different name, and (b) items still open were written against an **older aesthetic** and need re-speccing to the current bar. Your job: **go row by row through the non-shipped items, mark what's now done/superseded, and upgrade the still-open recommendations to the current design language** (defined in §3), updating the sheet in place — **and then some.** You own the design track: you have the **Mobbin MCP** for fresh references, you may **upgrade the already-made plans** (not just the sheet) where they've gone stale, you should **consult the terminal Claude Code** for an independent scan, and you're expected to **run your own review** and bring fresh suggestions. Full scope + tools in §5.

## 1. The board — current state (as of 2026-07-12)

- **119 rows.** ~69 **Shipped**. Non-shipped: **27 OPEN** (never started), plus ~4 **PARTIAL**, several **BUILT/verified** (effectively done), 1 **SPEC** (SE1), and a handful of Superseded/Blocked/Closed.
- Columns: `ID | Area | Surface | Recommendation | Why it matters | Priority | Effort | IGU file(s) | Mobbin reference | Status`.
- Origin + legend + the "Top 10 highest-leverage moves" are on the **"Start Here"** tab. Reference apps: Hevy, MacroFactor, WHOOP, Oura, Future, Ladder, Fitbod, Intercom, Centr, Apple Fitness.
- **Explicitly out of scope** (per Hasan): plate calculator; food-diary / barcode / food-search logging (IGU is adherence/target-based).

**Board hygiene (learned the hard way — `[[feedback_board_id_collisions]]`):** before appending a new row, scan column A for the next free ID **per prefix**. Current max per prefix: `CC8, CL11, CO13, RO5, WK13, HX5, NU10, MS4, ON3, ST2, CT6, AD4, PUB10, FU4, BUG12, SE1, GC1, PR1, DS1, CARE1, PF1, UN1, CAL1, WA1`. In openpyxl, `cell.value = None` does **not** clear a cell — assign `.value` explicitly. Read with `data_only=True`.

## 2. The reconciliation pass (do this first — it's the point)

Go through every **non-Shipped** row and classify:

**A. Now DONE / SUPERSEDED by recent work → update Status.** Confirmed examples (verify, then mark):
- **ON2 — "Coach selection → recommended card → list → rich coach profile"** → **superseded**. The rich per-coach public profile shipped as `/coaches/:slug` (`CoachPublicProfile`), and the onboarding coach-selection card + detail dialog were reskinned to it. Re-scope to any remaining thread (e.g. the "Start with <coach>" preselect polish) or close.
- **PUB6 — "Testimonials: lead with outcomes/results, not just stars; authentic"** → **superseded**. The entire testimonials/reputation system shipped (T1 + T3): consent + attribution, coach/admin curation, honest ≥5 aggregate, and **outcome proof** (real server-computed weight-change chips) on the coach page + `/testimonials` + Meet-the-Team. This is *exactly* PUB6's intent, delivered richer. Close or re-scope to the public `/testimonials` layout polish only.
- **Audit for more:** CC1/CC2 (metric-card + plain-language) are shipped and now the house style — check any open item that duplicates them. WK10 / SE1 (sessions/calendar) partially overlap the sessions-booking specs. PUB1 (landing hero) vs the PUB8 flatten.

**B. Still open, but the recommendation looks DATED → upgrade it.** The sheet's recommendations were written before the current bar (§3). For each still-open item, re-read its `Recommendation` and ask: *would we still build it that way now?* Upgrade the row's Recommendation (and note the delta in Status) to match the current design language. Likely candidates: the public-page items (**PUB5** how-it-works, **PUB7** FAQ, **PUB10** waitlist), **ST1** grouped settings, **CT4** article reader, **CO8** reports (should be a MetricCard grid now), **CL5** streak, **CO4** capacity gauge, **CC8 / RO5** empty states, **NU6** shareable phase-summary. Bring each up to flat-surface / crimson / Bebas-number / MetricCard / plain-language conventions.

**C. Genuinely still open + still correctly specced → leave, just confirm Priority/Effort.**

Record each decision in the **Status** column with a date (e.g. `SUPERSEDED by /coaches/:slug 2026-07-12` / `UPGRADED 2026-07-12 — re-specced to current bar` / `OPEN — still valid`).

## 3. The CURRENT IGU design language (the bar to measure against)

This is what shipped recently and set the current bar. Old sheet items should be judged against **this**, not the aesthetic from when the sheet was written.

**Foundation (DS1, `[[project_igu_design_foundation]]`):** body font **Geist**; `font-bold` **capped at 600** (no 700s, enforced in the tailwind theme); **Card primitive is flat** (no `shadow-sm`); `CardTitle` weight 500. **Bebas Neue** = display (hero numbers + names), **JetBrains Mono** = data/counters/labels.

**Tokens (real IGU, light + dark, default dark — `ThemeProvider` shipped):** `--primary` = crimson `hsl(355 78% 48%)`; `--radius` 12px (`rounded-lg`); mono uppercase section headers with a short primary tick; muted secondary surfaces (`bg-muted`/`border-border`), no gradients, no shadows (PUB8 flatten + BTN1 gradient-button retirement — flat crimson buttons only).

**House data-viz patterns:** **MetricCard (CC1)** — label · timeframe · sparkline · hero value · delta · avg — is the single chart/stat standard. **Plain-language interpretation (CC2)** pairs a one-sentence read with every number. **PhaseAnnotatedTrendChart** for phase-banded trends.

**Recent components that define the current bar (read these before re-speccing — `[[feedback_mockups_ground_in_real_components]]`: mock against real components, not tokens alone):**
- `CoachPublicProfile` — gradient/photo hero + Bebas name + a null-omitting stats row + primary specialty chips + editorial divider sections (Certified / Trains at / Located / reputation / Follow) + intro-video affordance + reputation quote cards. The reference for a polished public card.
- `WeightChangeProof` — compact muted chip: trend glyph + "{n} kg · {n} weeks · <phase>" + note, **neutral color** (no good/bad implication). The reference for a data chip.
- `NutritionPhaseCard` + `MacroDistributionRibbon` — hero `kcal` in Bebas, thin P/F/C ribbon, expected-vs-actual mono strip, status left-rail. Reference for a metric hero.
- The **sectioned-editor** pattern (coach profile editor) — sticky Preview/Save header, computed completeness meter, mono section heads, counters, chips.
- `ClientPageLayout` / role shells, `ClickableCard` (never `<Card onClick>`), attribution-derived names.

**SEO note (don't regress):** metadata is now **React 19 native** (`<title>`/`<meta>` hoisting via `SEOHead`) — **react-helmet-async was removed** because it's inert under React 19. Any new public surface uses `SEOHead`; do not reintroduce helmet.

## 4. Where the recent work lives (compare against these)

- `docs/COACH_PROFILE_REDESIGN_BUILD.md`, `docs/T2_COACH_PUBLIC_PAGE_BUILD.md`, `docs/CPR_TO_T2_HANDOFF.md` — coach profile + public page.
- `docs/T1_TESTIMONIALS_CURATION_BUILD.md`, `docs/T3_WEIGHT_ATTACHMENT_BUILD.md`, `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md` — testimonials/reputation + proof.
- Components: `src/components/coach/CoachPublicProfile.tsx`, `src/components/testimonials/WeightChangeProof.tsx`, `src/components/nutrition/NutritionPhaseCard.tsx`, the MetricCard, `src/components/ui/clickable-card.tsx`, `src/components/layouts/ClientPageLayout.tsx`.
- Mockup fidelity examples: `docs/COACH_PROFILE_REDESIGN_MOCKUPS.html` (real tokens, light/dark).

## 5. Tools you have + how far you can push (Hasan greenlit all of this)

You are **not** limited to reconciling the sheet. You own the design track and are empowered to:

1. **Use the Mobbin MCP** (`search_screens` / `search_flows` / `search_sections`) whenever you're re-speccing or upgrading an item. The original sheet cited Mobbin references (Hevy, MacroFactor, WHOOP, Oura, Future, Ladder, Fitbod, Intercom, Centr, Apple Fitness) — pull fresh, specific screens to ground each upgraded recommendation in a real pattern rather than a vague note. Cite the Mobbin screen in the row's `Mobbin reference` column. Ground every mock in **real IGU components** too (`[[feedback_mockups_ground_in_real_components]]`), not tokens alone.
2. **Upgrade / improve the already-made plans, not just the sheet.** If, while comparing, you find that a *shipped* build spec or a recent design decision is itself now dated, inconsistent, or has a gap (e.g. the coach-profile or testimonials docs, the public-page language, a component's states), propose the improvement — write it up, flag it to Hasan, and (with his ok) add it to the board as a new row. The recent work set the bar but isn't sacred; hold it to the same scrutiny.
3. **Consult the terminal Claude Code for an independent cross-check.** You can't drive the terminal directly (Hasan relays paste blocks), but you *should* hand CC a scan request: ask it to independently review the design plan + the current codebase and surface its **own** suggestions, gaps, and inconsistencies (it sees the full code and may catch things the sheet + a design read miss). Fold its findings into your reconciliation. Write the ask paste-ready, terse, `path:line`.

**Do your own full review.** Beyond the row-by-row pass, form your own opinion: read the recent build docs (§4) + the shipped surfaces, and call out anything that undercuts the current bar or is worth adding — new items, cross-cutting inconsistencies, quick wins. You're expected to bring fresh eyes, not just process the existing list.

**Workflow guardrails (two-agent):** Cowork **design/spec** role — you read code + sheet, use Mobbin, write specs/mockups, update the board, and coordinate with CC via Hasan. You do **not** push git or run migrations (terminal Claude Code builds; Hasan relays). Prod = Supabase `ghotrbotrywonaejlppg` (`execute_sql`, read-only for design work). Keep hand-offs terse. Don't edit the FOR_LATER-owned docs unless reassigned.

## 6. Suggested sequence of deliverables
1. **Reconciliation report** — for all ~27 open + ~4 partial items, one line each = `ID → {DONE/SUPERSEDED | UPGRADE | KEEP}` + reason, sheet Status updated to match. (Confirmed supersedes to start from: ON2, PUB6.)
2. **CC cross-check** — hand terminal Claude Code (via Hasan) a paste-ready request to independently scan the plan + codebase and return its own gaps/suggestions; merge into the report.
3. **Upgrade pass** — re-spec the top-priority UPGRADE items (P1s first) to the current bar, each grounded in a fresh Mobbin screen + real IGU components.
4. **Your own additions** — any new items / cross-cutting fixes your review surfaced, added to the board (mind the ID-per-prefix hygiene in §1).

Surface anything ambiguous to Hasan rather than guessing scope.
