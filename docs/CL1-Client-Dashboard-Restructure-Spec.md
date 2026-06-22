# CL1 — Client dashboard: one-hero + ranked stack + demoted Account/billing

**Status:** Drop-in spec (2026-06-22, Cowork). **Priority / effort:** P1 / M. Frontend only — reorders existing cards in ONE component, no new cards, no new data/queries, no DB.

## Goal
Give the active client dashboard **information scent**: lead with one hero (today's workout), present the rest as a single **ranked stack** by importance, and **demote billing/plan into a quiet "Account" group** so it stops competing with training content. (Board CL1: "Apply one-hero (TodaysWorkoutHero) + ranked stack; demote billing/plan to a quiet 'Account' group.")

## ⚠️ Target the live component, not the dead one
The active overview is **`src/components/client/NewClientOverview.tsx`** — that's what `ClientDashboardLayout`'s `renderContent()` switch returns for `"overview"` (and default). The big card-grid `OverviewSection` function inside `ClientDashboardLayout.tsx` (L640-800) is **orphaned dead code** — defined but never called by the switch. **Do NOT edit `OverviewSection`** (it would have zero effect — the NU3 dead-mount lesson). All CL1 work is in `NewClientOverview.tsx`. (Optional: delete `OverviewSection` in a separate cleanup; out of scope here.)

## Current order (NewClientOverview.tsx, L172-267) — the problem
`PaymentAttentionBanner → AlertsCard → LogTodayCard → TodaysWorkoutHero (4th!) → 2-col grid [NutritionTargets, Coach | WeeklyProgress, QuickActions] → AdherenceSummary → 2-col grid [PlanBilling | MyCareTeam]`

Issues: the workout hero is buried 4th; billing sits mid-page co-equal with care team; symmetric 2-col grids give every card equal weight (no ranking).

## Confirmed target structure
Reorder the **return JSX only** (L172-267). All hooks, data loading, the `loading` skeleton, the `programCount === 0` empty-state branch, and every card's props stay exactly as they are — this is a reorder + a grouping wrapper, nothing else.

```tsx
return (
  <div className="space-y-6">
    {/* 1. Interrupts — only render when relevant; unchanged */}
    <PaymentAttentionBanner subscription={subscription} profile={profile} />
    <AlertsCard profile={profile} subscription={subscription} weeklyLogsCount={weeklyLogsCount} />

    {/* 2. Hero — the one anchor (existing empty-state branch preserved verbatim) */}
    {programCount === 0 && profile?.status === "active" && subscription?.status === "active" ? (
      <ClickableCard onClick={() => navigate("/messages")} ariaLabel="Message your coach about program status">
        {/* ...unchanged "coach is preparing your program" card... */}
      </ClickableCard>
    ) : (
      <TodaysWorkoutHero userId={user?.id} />
    )}

    {/* 3. Daily log — today's habit loop, directly under the hero */}
    {user?.id && (
      <LogTodayCard
        userId={user.id}
        phaseId={activePhase?.id ?? null}
        phaseStartDate={activePhase?.start_date ?? null}
      />
    )}

    {/* 4. Ranked training stack — single column, importance order */}
    <NutritionTargetsCard userId={user?.id} />
    <WeeklyProgressCard userId={user?.id} />
    <AdherenceSummaryCard userId={user?.id} />
    {coach && (
      <CoachCard coach={{ ...coach, id: coach.user_id }} clientFirstName={profile?.first_name} />
    )}
    <MyCareTeamCard
      subscriptionId={subscription?.id}
      primaryCoach={primaryCoach}
      nextBillingDate={subscription?.next_billing_date}
    />

    {/* 5. Utility nav */}
    <QuickActionsGrid profile={profile} subscription={subscription} />

    {/* 6. Quiet "Account" group — billing demoted, visually secondary */}
    <section className="space-y-4 pt-4 border-t border-border/60">
      <h2 className="text-sm font-semibold text-muted-foreground">Account</h2>
      <PlanBillingCard
        subscription={subscription}
        onManageBilling={() => navigate("/billing/pay")}
      />
    </section>
  </div>
);
```

Notes:
- **Single-column ranked stack** (drop both `grid md:grid-cols-2` wrappers) is the faithful "ranked stack" — clearest scent and best on mobile (clients are mobile-first). Cards keep their internal layouts. If any card looks too wide on desktop, that's a later polish pass, not CL1.
- The **"Account" group** is the only new markup: a `border-t` + muted `Account` heading wrapping `PlanBillingCard`, signalling "secondary." Per the confirmed scope, **only billing/plan is demoted** — `MyCareTeamCard` stays in the coaching stack (#4), `QuickActionsGrid` sits as utility nav above the Account group.
- Imports already present in the file (all these components are imported at the top) — no import changes needed since the same set is reused; just reordered usage. Confirm `CardContent`/`ClickableCard`/`Dumbbell`/`MessageSquare` (empty-state) stay imported.

## Non-goals / guardrails
- Don't touch the data-loading (`loadDashboardData`), the `hasFetched` ref-guard, the loading skeleton, or the `programCount === 0` empty-state logic — reorder render output only.
- Don't edit the orphaned `OverviewSection` in `ClientDashboardLayout.tsx`.
- Don't touch the client nutrition PAGE — only the dashboard `NutritionTargetsCard` summary tile is in scope (separate `NU*` items own the page).
- No new cards, props, queries, RPCs, or migrations.
- Keep the `pb-24 md:pb-8` already applied by `ClientDashboardLayout`'s content wrapper (mobile dock clearance) — unaffected since this component renders inside it.

## Verify
- `npx tsc --noEmit` clean; `npm run build` clean.
- Active client dashboard (`/dashboard`, overview): order is hero → log → ranked stack (Nutrition, WeeklyProgress, Adherence, Coach, CareTeam) → QuickActions → quiet "Account" with billing last. The "coach is preparing your program" empty state still replaces the hero when `programCount === 0`. No card disappears (all the same cards render, just reordered/grouped).
- **Live smoke is auth-gated:** `/dashboard` requires an active client session (admin/coach get redirected by `Dashboard.tsx`). Verify via an active test-client login (or the Capacitor build) post-merge; can't be smoked through the admin session. Confirm mobile single-column reads cleanly and desktop isn't visually broken.
