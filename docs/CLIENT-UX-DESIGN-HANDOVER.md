# IGU Client UX — Design Handover (2026-06-25)

Brief for the next Cowork session continuing the client-side UX redesign. Read this end-to-end before touching pages. The work so far has been built by Cowork directly (file edits), `tsc`-verified, and **live-verified by driving the deployed site as a logged-in test client** (Claude in Chrome). Hasan runs the `git`/`supabase` blocks himself in a **plain terminal** (NOT Claude Code) — give him paste-ready shell blocks, no inline `#` comments (his zsh runs them as commands).

## Workflow facts
- **One Supabase project** = prod (`ghotrbotrywonaejlppg`). Out-of-band DDL via `execute_sql` IS prod; idempotent `CREATE OR REPLACE` + later `supabase db push` to register migration files.
- **Live verification:** Hasan signs into a test client (he can't have Cowork enter passwords). The **1:1 Online** test client (`dr.ironofficial+online@gmail.com`, user_id `4331fa4f-c65e-4397-aef8-8d9d56a4fa9e`) has an active "Summer Cut" nutrition phase, weight logs, and (seeded 2026-06-25) an active workout program for the week of Jun 22-28. Coach = Dr Iron (`92605b68-6f91-4f82-aa91-45b67efbf9c8`, has a WhatsApp number).
- Verify after each change: `npx tsc --noEmit`, then have Hasan push, then hard-reload (Cmd+Shift+R busts the apex cache) and screenshot the deployed page. Desktop 1440 + mobile 414.

## The design language (keep consistent — this is the bar)
- **Flat dark surfaces.** No gradients. (`bg-background`, not `bg-gradient-to-br …`.) Cards: `bg-card` / `bg-background-primary`, `0.5px` borders, `rounded-lg`.
- **Emerald `w-1` status rail** on hero/status cards (the `NutritionPhaseCard` vocabulary): emerald = on-track/done, amber = due/attention, neutral = not-started, red = behind.
- **Rounded `999px` status pills** (success/secondary/amber/danger), not raw shadcn Badges where it reads inconsistent.
- **CC1 metric-card pattern:** muted label · timeframe · hero number · delta · sparkline.
- **MacroDistributionRibbon** (`src/components/nutrition/MacroDistributionRibbon.tsx`): red/amber/blue P/F/C stacked bar + monospace gram labels. Reuse it; don't reinvent macro displays.
- **Monospace** (`font-mono`) for numbers/stats/dates.
- **Composition = hierarchy + grouping + geometric balance.** Important first; related cards grouped; NO mismatched-height dead space. The winning pattern is **main column + side rail** (or "stack the short cards into one column to fill a tall card's height"), NOT forced equal 2-col pairs (those leave voids when heights differ — Hasan rejected that twice).
  - **Dashboard** (`NewClientOverview.tsx`): full-width Today's-workout hero on top; then `grid lg:grid-cols-[1.6fr_1fr]` — main = nutrition target / this-week / adherence; rail = log-today / coach (WhatsApp) / care-team. Account demoted full-width at the bottom.
  - **Client nutrition** (`ClientNutrition.tsx`): `grid lg:grid-cols-2` — left column stacks phase card → weekly ribbon → log-today → message-coach (short cards filling the height); right = trend graph. "This week" tracking form full-width below.
- **Mobile-first** (clients live on phones): everything stacks to one column; bottom dock handles nav; `useIsMobile()` for drawers/branching; `pb-24 md:pb-8`, safe-area, 44px touch targets.

## Shipped this sweep (on main, live-verified)
Dashboard main+rail; client nutrition regroup + recompose; WhatsApp coach button on `CoachCard` (real WA glyph, via `get_coach_whatsapp_for_client(p_coach_user_id)` RPC); **WK10 client calendar** = week-grid (`WorkoutCalendar.tsx`, `useClientWorkoutsWeek`); coach-RLS weigh-in fix (migration `20260624140000`); week-count alignment to `startOfIguWeek`; **`ClientPageLayout`** shell (`src/components/layouts/ClientPageLayout.tsx`) wrapping ClientNutrition, TeamNutrition, WorkoutCalendar, ClientMessages, ExerciseHistory, AddonsCatalog; body-fat graph empty state.

## NEW DIRECTIONS from Hasan (2026-06-25) — the next batch
Overarching intent: **stop spreading features across many separate pages; unify + simplify so clients aren't lost.** Mock everything in `visualize` first (mockups have been landing well), search **Mobbin** for patterns like we have all sweep, get Hasan's nod, then build + live-verify.

1. **Unify all "entries" + a reminder system (FEATURE — likely its own session, maybe Claude Code for backend).**
   - One logging hub: weight, steps, body fat, circumference, weekly check-in grouped in one place (the NU9 "This week" completion anchor is the seed).
   - Entries always available, but **remind when overdue per cadence** (weight 3×/wk min; measurements every N weeks; body fat ~every 4 wks; check-in weekly). Reminders = **email now**, in-app push later, **client-toggleable on/off**. Needs: a reminder/cadence model + notification preferences table + email templates (reuse `_shared/` email system) + a cron, mirroring the existing `process-*` cron jobs.
   - Steps later: Apple Watch / Apple Health sync (native-app phase).

2. **Weekly check-in — group + unify now; extensible later.** Currently just adherence + noticeable-changes, scattered. Make it ONE guided/grouped check-in surface. Later: advanced questions (bowel habits, energy, stress) — **dietitian-scoped** (tie to the dietitian subrole). Mock the unified check-in.

3. **Workout area simplification.** Rename "Workout Calendar" → **"Workouts"** (an area, not just a calendar). Fold **Exercise History** in as a button/tab inside Workouts (remove the separate nav item). Consider a **"Message coach about workouts"** action. Week view currently has empty space when sparse — either enrich each day's session chip with a brief (exercise count + primary muscles), or offer a **Week/Month toggle** (Hasan likes the month look — it's denser). My rec: Week/Month toggle, default month; enrich week chips with a one-line brief.

4. **Merge Workout Library + Educational Content → one "Educational / Learn" area.** Today: educational pathways, educational videos, and exercise videos are 3 separate things — too fragmented. Recommendation: ONE library page with a **segmented control / tabs** (Exercises · Videos · Pathways) over a **shared search** and consistent media cards. Mobbin refs: content libraries (Nike Training Club, MasterClass, Headspace) = single library + category filter + unified search. Mock it.

5. **Audit tail (carried over) — wrap remaining pages in the shell + redesign.** `Exercise Library` and `Profile`/Account still lose the left nav. These + `ClientSessions` are the remaining shell wraps. **`Account`, `WorkoutLibrary`, `EducationalVideos` are multi-role** (`AuthGuard`-only; coaches/admins reach them) — make `ClientPageLayout` **role-aware** (client → sidebar shell; coach/admin → bare, no client sidebar/`userRole`) and **test with a coach login** (can't verify staff branch from a client session). `ClientSessions` has 4 return branches + a nested fragment — wrap each carefully. Distraction-free workout logger + payment-flow pages stay bare on purpose.

6. **Body-fat graph blank** — FIXED 2026-06-25 (was `return null` on no data; now an empty-state card). Mentioned in case the next pass reworks the graphs area.

## Mockups produced this sweep (reproduce the same look)
All via the `visualize` tool (ephemeral widgets; reproduce from the design language above). Titles: `client_dashboard_recomposition_main_rail`, `client_dashboard_today_redesign`, `client_nutrition_thisweek_redesign`, `coach_progress_tab_redesign`, `coach_care_team_tab_redesign`, `coach_profile_tab_redesign`. Specs in `docs/`: PR-/CT-/PF- (coach tabs), SE- (sessions), WK- (workouts calendar), NU9-/CL2-/PF-. Board backlog: `docs/IGU-Design-Changes-Master.xlsx` "Design Changes" sheet (status col J; scan col A for next free ID per prefix before adding rows).

## Recommended order for the next session
Mock #4 (Educational/Learn merge) + #3 (Workouts area) + #2 (unified check-in) for Hasan's approval first (they're the big "unify" wins he most wants), in parallel finish #5 (role-aware shell — unblocks Exercise Library + Profile + Sessions), then scope #1 (reminder feature) as its own backend-y track.
