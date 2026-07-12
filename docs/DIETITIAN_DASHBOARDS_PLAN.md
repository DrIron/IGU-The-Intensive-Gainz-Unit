# Dietitian Dashboards — Plan

_Planning doc (shape / model / sections / phases / open decisions). Not a build spec yet._
_Owner track: FOR_LATER planning session. Created 2026-07-05. Mockups: `docs/DIETITIAN_DASHBOARDS_MOCKUPS.html` (7 screens — Home, Nutrition Clients, Client review + micros, per-client Meal plan, Supplements, Profile, Learning) + `docs/MEAL_PLANNING_BOARD_MOCKUPS.html` (the meal planning board — dietitian board, options picker, client view)._

Promoted from `docs/FOR_LATER.md` → "Dietitian dashboards + food-logging integration". Gives the
dietitian a **first-class working dashboard**, laid out like the coach dashboard but scoped to
nutrition and to **individual clients only**.

> **Companion plans (co-owned — plan them together).** This dashboard and the food logger are **one
> connected nutrition system**, planned in the same FOR_LATER track. Split of ownership to avoid
> duplication, not to build a wall: `docs/FOOD_LOGGING_PLAN.md` owns the food **data model** (catalog,
> logs, micros, meal-plan/supplement schema — Part IX); **this doc owns the dietitian build** that
> consumes and authors on top of it. They **cross-reference** — the food model lives once (there), the
> dietitian surfaces live once (here) — and are meant to ship as a coordinated whole. This doc also
> builds on the dietitian **role foundation** in `docs/SPECIALIST_PARITY_BUILD.md` (apply / role-grant /
> profile / care-team presence, model A).

---

## 1. Current state → why

Today a dietitian is effectively **"a coach with a subrole"**:
- No dashboard of their own. They sign into the **coach** dashboard layout (`CoachDashboardLayout` +
  `CoachSidebar`), which **injects** a single subrole-gated **"Nutrition clients"** nav item
  (`DIETITIAN_NUTRITION_CLIENTS_ITEM`, navOrder 2.1).
- That item renders **`DietitianMyClientsPage`** — a solid roster already: buckets clients into
  **Action needed / Active phases / Drifting / Ended**, search/filter/sort, unread-message badges,
  rows open the **Client Overview nutrition tab** (`/coach/clients/:id?tab=nutrition`).
- Assignment is via **`care_team_assignments`** (`specialty='dietitian'`, `lifecycle_status IN
  ('active','scheduled_end')`); RLS via `is_dietitian_for_client` / `is_care_team_member_for_client`;
  nutrition edit precedence via `can_edit_nutrition` (Admin → Dietitian → Coach → Self).

**The gap:** there's a roster but no **dietitian home/overview**, no dietitian-scoped shell, and none of
the deeper nutrition tooling (full food logs, micros, meal-plan authoring, supplements) that the
food-logging plan will unlock. This plan gives them their own dashboard and a place for that tooling to
land.

---

## 2. Decisions locked (2026-07-05)

| # | Decision | Choice |
|---|----------|--------|
| DD1 | Structure | **Own `/dietitian` dashboard**, first-class — laid out like the coach dashboard with nutrition-appropriate sections (not just an injected item on the coach shell). |
| DD2 | Scope of clients | **Individual clients only — dietitians have NO teams.** No team-plan builder, no team pulse, no head-coach concepts. Every surface is individual-client-scoped. |
| DD3 | Sequencing | **Two layers, one system.** Layer A builds on **today's** nutrition data (usable before food logging lands); Layer B (food logs / micros / meal plans / supplements) integrates with the co-owned `FOOD_LOGGING_PLAN.md` and ships coordinated with it. |
| DD4 | Authoring | **Full toolset** — meal-plan templates + supplement recommendations. The **food data model** is single-sourced in food-logging Part IX; **this dashboard fully plans the dietitian-side build** (the authoring/review UI + workflow). |
| DD5 | Scope | **Nutrition-only.** Dietitians do not manage workouts/programs. Reuse coach *layout* components, not coach *training* features. |
| DD6 | Meal plans + supplements | **Per-client, not generalized** (2026-07-05). No standalone/global "Meal Plans" or "Supplements" section or reusable template library — both are authored **within a specific client's** Nutrition surface (tabs/actions on Client → Nutrition), built for that client. |
| DD7 | Learning access | **Dietitians get the same staff Learning area as coaches** and other staff (2026-07-05) — the shared educational content (`coach_educational_content` / Coach Hub Training·Library·Resources). Add a **Learning** nav item to the dietitian dashboard. |

---

## 3. Layout & sections (coach-parity, nutrition-scoped, team-free)

Reuse the coach dashboard **layout patterns** (sidebar + section shell + Client Overview shell) but with
a dietitian section set. Mirrors coach where it makes sense; **drops every team surface** (DD2).

| Section | Coach analog | Dietitian version |
|---------|--------------|-------------------|
| **Overview / Home** | Coach dashboard overview | Headline stats (active nutrition clients, action-needed, drifting, unread) + a **"Needs your eyes" queue** (pending adjustments, no active phase, overdue weigh-ins, off-track adherence). Reuses the `DietitianMyClientsPage` bucketing logic + `DRIFT_DAYS_THRESHOLD`. |
| **My Clients** | Coach "My Clients" | The existing **`DietitianMyClientsPage`** roster (individual clients only), promoted into the dietitian shell. |
| **Client → Nutrition** | Client Overview shell | Opens the **Client Overview nutrition tab** (the dietitian's deep surface, **full** read + micros vs coach macro-only). **Meal plan** and **Supplements** are **tabs/actions HERE** (per-client, DD6) — build/manage a specific client's plan + supplement recommendations in their context. _(Layer B — model in `FOOD_LOGGING_PLAN.md` Part IX; per-client, not a template library.)_ |
| **Learning** | Coach Hub / staff learning | **Same shared staff learning area** coaches + other staff get (`coach_educational_content` — Training / Library / Resources). Dietitian nav item (DD7). |
| **Messages** | Coach messages | Care-team + coach↔client threads for assigned clients (reuse `useStaffUnreadCounts`, existing thread UI). |
| **My Profile** | `CoachProfile` | Specialist profile page — **owned by `SPECIALIST_PARITY_BUILD.md`** (Pillar 3); this dashboard just links it. |

**Sidebar = Dashboard · Nutrition Clients · Learning · Messages · My Profile.** No "My Teams", no
team-plan builder, no head-coach anything (DD2), and **no standalone Meal Plans / Supplements sections**
— those are per-client (DD6). That's the load-bearing difference from the coach dashboard.

---

## 4. Two layers

### Layer A — buildable now (today's nutrition data)
Everything that doesn't need food logging. This is a real, useful dietitian dashboard on its own:
- The **`/dietitian` shell** (sidebar + sections), promoting the roster out of the coach shell.
- **Overview/home** with the needs-attention queue (reuse the existing bucketing + roster RPCs).
- **Per-client nutrition review** via the Client Overview nutrition tab: phases/goals, weight &
  measurement trends, adherence check-ins, nutrition adjustments (approve/reject), notes — the
  dietitian already has edit rights here via `can_edit_nutrition`.
- **Messages** + **profile link**.

### Layer B — the food-log-connected dietitian build (co-owned with `FOOD_LOGGING_PLAN.md`)
The deep nutrition tooling. The **food data model/RLS/role-layered read live once** in the food-logging
plan (Part IX + §4.4 + §4.6) — we don't restate them — but the **dietitian-side build is fully planned
here**: the surfaces, workflows, and where each lands in the dashboard. The two plans ship coordinated.
- **Full food logs + micronutrient panel.** The dietitian is the role that sees the *full* log + micros
  (coach is macro-only). Lands as the deep view in the Client → Nutrition surface + a roster-level
  "micro flags" signal (e.g. iron trending low) on the overview queue.
- **Meal plans (per-client, DD6) — a meal planning board modeled on the workout planning board.**
  Mockups: `docs/MEAL_PLANNING_BOARD_MOCKUPS.html`; model in `FOOD_LOGGING_PLAN.md` Part IX §1. Day →
  Meal/Snack/Supplement blocks (renamable, reorder, notes) → category slots where the dietitian
  **multi-selects recommended options with amounts** (client picks one) or leaves the slot **open**. A
  live rail shows **estimated daily kcal/macros (with a range) + accumulating micronutrients** — the
  nutrition analog of the coach's volume readout — and **links to the active phase with an over-target
  alert**. Client gets **"log from plan"** one-tap logging. Per-client; not a reusable template library.
- **Supplement recommendations (per-client, DD6)** — inside the client's surface, author that client's
  supplements (dose/schedule/notes), the client checks them off in their Food diary, and **supplement
  adherence + any micro contribution** flow back to this dashboard. ("Recommendations", never
  "prescriptions".)
- **Adherence + alerts into the overview queue.** Calorie-band adherence, the two-tier macro alerts
  (loud protein/calories), plan adherence, and supplement adherence all feed the DP1 needs-attention
  home so the dietitian sees who needs them.

Layer A is built so Layer B **snaps in** without reworking it; Layer B is planned in lockstep with the
food-logging phases (its Phase 4 role-layered read is the prerequisite — see DP3/DP4).

---

## 5. Data & access (no new access model)

- **Assignment:** `care_team_assignments` (`specialty='dietitian'`) — unchanged. Individual clients only;
  no team_id anywhere in the dietitian surfaces (DD2).
- **RLS/permission:** reuse `is_dietitian_for_client`, `is_care_team_member_for_client`,
  `can_edit_nutrition`. No new gates for Layer A.
- **Routing/guards:** a `/dietitian` route tree gated to an **approved `dietitian` subrole**
  (`has_approved_subrole('dietitian')`), analogous to the coach guard. (Open decision DD-a: a dedicated
  `RoleProtectedRoute` subrole guard vs the current subrole-gated injection.)
- **Payout/level:** dietitian payout + level already exist (`staff_professional_info`,
  `DIETITIAN_PAYOUT_PER_CLIENT`); the dashboard surfaces them read-only where useful, doesn't change them.

---

## 6. Phases

- **DP1 — Dietitian shell + home.** Stand up the `/dietitian` route tree + sidebar (coach-parity layout,
  no team items) + an **Overview** home (headline stats + needs-attention queue reusing the roster
  bucketing). Move the roster into the shell. _Verify: an approved dietitian lands on their own dashboard;
  a non-dietitian can't; teams never appear._
- **DP2 — Per-client nutrition depth (today's data).** Ensure the Client Overview nutrition tab is the
  full dietitian surface (phases/adjustments/weight/adherence/notes), reachable from the roster; wire
  Messages + profile link. _Verify: dietitian reviews + edits a client's nutrition; coach-with-dietitian
  read-only rule still holds._
- **DP3 — (after food logging) full logs + micros.** Mount the dietitian food-log + micro panel from
  `FOOD_LOGGING_PLAN.md` (Phase 4 role-layered read). _Reference, don't re-spec._
- **DP4 — (after food logging) meal-plan + supplement authoring.** Mount the meal-plan builder +
  supplement recommendations (Part IX). Plan/supplement adherence feeds the DP1 queue.
- **Generalize (optional, later):** the same dashboard-promotion pattern could apply to physio /
  sports-psych / mobility specialists (parameterized by subrole) — parallels the specialist-parity
  generalization step. Out of scope for this doc.

---

## 7. Open decisions

1. **DD-a — Route/guard shape:** a first-class `/dietitian` route tree with a subrole guard, vs keeping
   `/coach/...` paths but re-skinning the shell for dietitians. (Leaning first-class `/dietitian` for a
   true own-dashboard feel, DD1.)
2. **DD-b — Shared shell vs forked:** how much of `CoachDashboardLayout` / `CoachSidebar` to
   parameterize by role vs a thin dietitian variant. Prefer **parameterize, don't fork** (matches the
   specialist-parity ethos).
3. **DD-c — Overview metrics:** exact headline stats + queue rules for the dietitian home (start from the
   roster buckets; confirm which belong on the home).
4. **DD-d — Mobile dock:** dietitians currently ride the coach dock; a `/dietitian` tree needs its own
   dock prefix set (nutrition-scoped) — small wiring, confirm at build.

---

## 8. Dependencies & boundaries

- **Role foundation:** `docs/SPECIALIST_PARITY_BUILD.md` (apply / role-grant / profile / presence, model
  A) — this dashboard assumes it; the profile page is owned there, not here.
- **Food logging (co-owned companion):** `docs/FOOD_LOGGING_PLAN.md` — the connected nutrition system.
  Food **data model** single-sourced there (Part IX); dietitian **build** planned here. Ship coordinated;
  cross-reference, don't duplicate. (The reverse pointer lives in food-logging Part IX.)
- **Reuse, don't fork:** coach layout components, Client Overview shell, roster bucketing +
  `DRIFT_DAYS_THRESHOLD`, `useStaffUnreadCounts`, the nutrition components. Parameterize on role.
- **Team-free invariant:** no `team_id`, no team-plan builder, no head-coach concepts on any dietitian
  surface (DD2).
