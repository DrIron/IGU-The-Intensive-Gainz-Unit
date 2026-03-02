# IGU QA Bug Fix Plan -- Corrected

## Verification Summary

Out of 22 reported bugs, **13 are already fixed in code**, **6 actually exist**, **1 is DB-only**, and **2 are likely fixed** (need final confirmation).

### Already Fixed -- No Code Changes Needed

| Bug | Description | Evidence |
|-----|-------------|----------|
| 1 | Exercise Library Empty | `ExerciseLibrary.tsx` correctly queries `exercise_library` table with `is_active=true`. If still empty on live site, it's an RLS policy or seed data issue -- check Supabase dashboard, not code. |
| 2 | Client Workout API Failing | `TodaysWorkoutHero.tsx` uses `.maybeSingle()`, handles null program gracefully, avoids known-broken FK joins. If still erroring on live, it's an RLS issue on `client_programs` or nested tables. |
| 3 | Nutrition Page Fatal Crash | No circular imports in `CoachClientNutrition.tsx` or its 9 child components. If the Vite bundle still crashes, try clearing `node_modules/.vite` cache and rebuilding. |
| 4 | Password Reset Route Broken | `ResetPassword.tsx` already checks both `window.location.hash` AND `window.location.search` for recovery tokens. Route is public (not inside AuthGuard). Has `PASSWORD_RECOVERY` event listener. If still broken, check Supabase dashboard redirect URL config. |
| 5 | Client Dashboard CTAs Wrong Tab | All three components (`AlertsCard`, `QuickActionsGrid`, `ProgressSummaryCard`) already have team-plan-aware routing. All receive `subscription` prop from `NewClientOverview`. If still wrong, the `subscription.services.type` value may not be "team" -- check DB data. |
| 6 | Services Page Price Mismatch | `ComparisonTable.tsx` already shows correct prices: 40 KWD (1:1 Online), 150 KWD (Hybrid). |
| 10 | Wrong URLs on Quick Actions | `CoachQuickActions.tsx` line 49 correctly navigates to `/coach/exercises`. `CoachMyClientsPage.tsx` also uses `/coach/exercises`. |
| 11 | Coach-Client Nutrition Nav | Route `/coach-client-nutrition` exists in `App.tsx` line 144 and `routeConfig.ts` line 139. Navigation is correct. |
| 14 | Persistent Toast | `PWAUpdatePrompt.tsx` has `duration: 15000` (15s), a "Dismiss" button, and a `hasPrompted` ref guard preventing re-triggers. |
| 17 | Grammar "1 days" | `ProgramLibrary.tsx` line 494 already has proper pluralization: `=== 1 ? '1 day' : 'N days'`. |
| 19 | Auth Close Black Screen | `Auth.tsx` X button already uses `navigate(-1)` with fallback to `navigate("/")`. |
| 20 | Kuwait Duplicate | Kuwait appears exactly once in `COUNTRY_CODES` array. No duplicate. |
| 21 | Hardcoded Greeting | `TodaysWorkoutHero.tsx` already has all 4 variants: morning, afternoon, evening, night. |

### Likely Fixed -- Quick Verification Needed

| Bug | Description | Status |
|-----|-------------|--------|
| 13 | "Fe Squad" in Client UI | Only found in `OnboardingForm.tsx` (defensive service name check, not displayed) and `LaunchTestChecklist.tsx` (admin-only). No client-facing instances of "Fe Squad" found. **Verify the live `/nutrition-team` page** -- the bug report mentions `TeamNutrition.tsx:123` and `AccountManagement.tsx:680` but grep found no matches. These may have already been cleaned up. |
| 22 | Accessibility (DialogTitle) | All ~30 checked files with `DialogContent` also have `DialogTitle`. May be fully resolved. **Run the app and check browser console for Radix warnings to confirm.** |

### DB-Only -- Not a Code Fix

| Bug | Description | Action |
|-----|-------------|--------|
| 12 | Test Data in Production | Run in Supabase SQL editor: `UPDATE discount_codes SET is_active = false WHERE code = 'TESTINGPHASE75%OFF15PPL';` and `DELETE FROM user_subroles WHERE user_id = (SELECT id FROM auth.users WHERE email = 'testcoach-debug@example.com');`. Investigate duplicate Hasan Dashti manually. |

---

## Bugs That Actually Need Fixing (6 bugs)

### Bug 7: Admin Client View Details -- Card View Missing Button for Active Clients

**Root cause:** `ClientList.tsx` passes `onViewDetails` callback to `ClientCardView` only for the **pending** tab (lines 864-872). The **active** and **old** tabs do NOT pass `onViewDetails`, so the "View Details" button is missing/non-functional in card view for those tabs. The table view works fine (dropdown has "View Form" for all clients).

**Files:** `src/components/ClientList.tsx`

**Fix:** Pass `onViewDetails={(id) => handleViewSubmission(id)}` to `ClientCardView` in the active tab (around line 889-893) and old tab (around line 909-913), same as the pending tab does.

**Also:** `ClientSubmission.tsx` shows "No submission found" when no form exists. This is correct behavior with `.maybeSingle()` -- but the message could be improved to say "This client hasn't completed their intake form yet" with available profile info. Optional polish.

---

### Bug 8: Admin Coach Profile Tab Shown Unnecessarily

**Root cause:** `AccountManagement.tsx` line 487 shows the Coach Profile tab for users with `admin` role, even if they're not coaches. The tab loads `CoachProfile.tsx` which handles null data gracefully (shows "No coach profile found"), so it doesn't crash -- but it's confusing UX for pure admins.

**Files:** `src/pages/AccountManagement.tsx`

**Fix:** Change the tab visibility condition from:
```tsx
{(userRoles.includes('coach') || userRoles.includes('admin')) && (
```
to:
```tsx
{userRoles.includes('coach') && (
```
in both the `TabsTrigger` (line 487) and `TabsContent` (line 891).

**Also fix:** The `TabsList` has hardcoded `grid-cols-2` (line 482). When only 1 tab shows (for regular clients), this creates an awkward layout. Make it dynamic:
```tsx
className={`grid w-full ${userRoles.includes('coach') ? 'grid-cols-2' : 'grid-cols-1'} mb-6`}
```

---

### Bug 9: Ghost Route -- `/coach/nutrition` Silently Renders Overview

**Root cause:** `CoachDashboard.tsx` SECTION_MAP maps `nutrition` and `client-nutrition` to `"client-nutrition"`. But `CoachDashboardLayout.tsx` `renderContent()` switch has **no case** for `"client-nutrition"` -- it falls through to `default`, rendering the overview instead of nutrition content.

**Files:** `src/pages/coach/CoachDashboardLayout.tsx`

**Fix:** Either:
- **(a)** Add a `case "client-nutrition":` to `renderContent()` that renders a nutrition component or redirects to `/coach-client-nutrition`, OR
- **(b)** Remove the `nutrition`/`client-nutrition` entries from SECTION_MAP in `CoachDashboard.tsx` (since nutrition has its own standalone route at `/coach-client-nutrition`). Unknown keys will fall through to overview, which is acceptable since these aren't real dashboard sections.

Option (b) is cleaner -- nutrition is already a standalone page, not a dashboard section. Remove the misleading SECTION_MAP entries so there's no pretense that `/coach/nutrition` is a valid route.

---

### Bug 15: DOB Not Saved During Onboarding

**Root cause:** The `submit-onboarding` edge function's Zod schema includes `gender` but **does NOT include `date_of_birth`**. The onboarding form collects DOB via `PersonalDetailsFields`, but the server-side function ignores it (Zod strips unknown fields). Gender IS written to `profiles_private.gender` (line 419-420), but DOB is never saved.

**Files:** `supabase/functions/submit-onboarding/index.ts`

**Fix:**
1. Add `date_of_birth: z.string().optional()` to the Zod schema (around line 57)
2. In the `profiles_private` update block (around line 419), add:
   ```typescript
   if (validatedData.date_of_birth) {
     profilePrivateUpdate.date_of_birth = validatedData.date_of_birth;
   }
   ```

This ensures DOB is written to `profiles_private` during onboarding, so `AccountManagement.tsx` can read it back.

---

### Bug 16: Calorie Deficit Warning -- Sign Logic Inverted

**Root cause:** `CalorieResults.tsx` line 22 checks `result.deficitPercent > 25`. But for a calorie *deficit*, `deficitPercent` is **negative** (e.g., -29.5%). The condition `> 25` only triggers for surpluses exceeding 25%, never for deficits. The warning exists but never fires for its intended use case.

**Files:** `src/components/calculator/CalorieResults.tsx`

**Fix:** Change line 22 from:
```typescript
const showDeficitWarning = result.deficitPercent && result.deficitPercent > 25;
```
to:
```typescript
const showDeficitWarning = result.deficitPercent && Math.abs(result.deficitPercent) > 25;
```

This triggers the warning for both aggressive deficits (e.g., -30%) and aggressive surpluses (e.g., +30%).

---

### Bug 18: Duplicate Dashboard/Overview Menu Items

**Root cause:** In `Navigation.tsx`, the client mobile menu has a "Dashboard" item pointing to `/dashboard` (overview section). The desktop dropdown also has both a "Dashboard" link and an "Overview" section link -- both go to the same place. On mobile, there's additionally a sticky "Go to Dashboard" button at the bottom.

**Files:** `src/components/Navigation.tsx`

**Fix:** In `getDashboardSections` for clients (lines 273-280), rename `t('overview')` to something more specific like `t('nutrition')` only, removing the "Overview" duplicate. Or: remove the hardcoded "Dashboard" link from the dropdown (lines 451-455) since the section items already cover it. The mobile menu "Dashboard" item is fine -- it's the entry point. The bottom "Go to Dashboard" sticky button is also fine for deep pages.

The simplest fix: In the desktop dropdown rendering, remove the separate "Dashboard" `DropdownMenuItem` (lines 451-455) for clients, since "Overview" already serves that purpose.

---

## Commit Strategy (Corrected)

### Commit 1: Admin fixes (Bugs 7, 8)
- `ClientList.tsx` -- pass `onViewDetails` to active/old client card views
- `AccountManagement.tsx` -- hide Coach Profile tab for non-coach users, fix grid-cols

### Commit 2: Ghost route cleanup (Bug 9)
- `CoachDashboard.tsx` -- remove misleading `nutrition`/`client-nutrition` from SECTION_MAP

### Commit 3: DOB onboarding sync (Bug 15)
- `supabase/functions/submit-onboarding/index.ts` -- add `date_of_birth` to Zod schema and write to `profiles_private`

### Commit 4: Deficit warning fix (Bug 16)
- `CalorieResults.tsx` -- fix sign logic with `Math.abs()`

### Commit 5: Navigation dedup (Bug 18)
- `Navigation.tsx` -- remove duplicate Dashboard/Overview item in dropdown

---

## Verification

After all fixes:
1. `npx tsc --noEmit` -- type check
2. `npm run build` -- verify production build
3. For bugs marked "already fixed" that were reported from live testing: investigate RLS policies and Supabase configuration if they still reproduce on the deployed site

## Bugs to Investigate at Runtime (Not Code Fixes)

If bugs 1-5 still reproduce on the live site despite correct code:
- **Bug 1 (Exercise Library):** Check `exercise_library` RLS -- does it have a SELECT policy for authenticated users?
- **Bug 2 (Workout API):** Check RLS on `client_programs`, `client_program_days`, `client_day_modules`, `client_module_exercises` for the specific client
- **Bug 3 (Nutrition Crash):** Clear Vite cache (`rm -rf node_modules/.vite`), rebuild, redeploy. If still crashes, check the production bundle for the specific minified variable
- **Bug 4 (Password Reset):** Verify Supabase dashboard "Redirect URLs" includes `https://theigu.com/reset-password`. Test with a fresh reset email.
- **Bug 5 (Wrong CTAs):** Query `subscriptions` for the test client and verify `services.type` equals `"team"` -- the routing logic depends on this exact string
