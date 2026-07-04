# Day-move slice — B4 "apply to following weeks?" + B5 calendar light scheduling

**Status:** Spec (2026-07-02, Cowork). One slice, two surfaces, one shared mutation.
**Parent:** `docs/COACH_CLIENT_REDESIGN.md` line 54 (B4 cascade prompt) + line 57 (B5 light scheduling). The last B4/B5 tail items.
**Grounding (code facts verified):** no reducer action changes a session's `dayIndex` today (only `DUPLICATE_SESSION_TO_DAY`, which copies); `SessionData.dayIndex` is 1–7 week-scoped; clones have `builder_session_id = NULL`, so cross-week correspondence must be matched on `(day_index, activity_type, name)`; `savePlanDirect` persists `plan_sessions.day_index` keyed on canonical `plan_sessions.id`; both calendars are read-only over `loadCanonicalSchedule`; the deload insert/remove RPCs are the precedent for calendar-scoped plan mutations + refresh.

---

## 1. Shared semantics — "move session to day"

A move changes `plan_sessions.day_index` (and appends `sort_order = max+1` on the target day). It never touches `plan_slots` → **`exercise_set_logs.plan_slot_id` identity is untouched, history is safe by construction.**

**Cascade rule ("apply to following weeks?"):** a corresponding session in week W+n = a session in that week with the SAME (old `day_index`, `activity_type`, `name` — name compared only when the moved session has one). Cascade updates every match in weeks AFTER the moved session's week. Weeks with no match are skipped silently (incl. deload weeks that don't mirror the session). Multiple matches in one week → move all of them (they were siblings on the same day).

**Collisions are allowed** — multiple sessions per day is a supported model; no merge logic.

## 2. Board surface (B4 tail)

- Session kebab (SessionBlock desktop + MobileDayDetail drawer) gets **"Move to day…"** — mirror the existing Duplicate-to-day picker UI exactly, mobile per `useIsMobile()` Drawer.
- New reducer action `MOVE_SESSION_TO_DAY { sessionId, dayIndex }` — current-week scoped via `withUpdatedCurrentWeek` (session keeps its id + slots; slots' `sessionId` binding unchanged).
- After the target day is picked: compute matches in FOLLOWING weeks (same matcher as §1, over `state.weeks`). If ≥1 match → prompt dialog: **"Apply to following weeks?"** body "Also moves the matching session in N later week(s)." Buttons: `This week only` / `All following weeks`. If 0 matches → no prompt, just move.
- Cascade path: new `MOVE_SESSION_CASCADE { fromWeekIndex, oldDayIndex, newDayIndex, type, name }` operating across all weeks > fromWeekIndex (needs the full-state variant, not `withUpdatedCurrentWeek`).
- Persistence: nothing new — the existing board save (`savePlanDirect` for client/team clones, `save_plan_from_builder` for templates) already writes `day_index`. Template skin gets the same affordance for free; client skin shows own-copy banner, team skin shows all-members banner — both already exist.

## 3. Calendar surface (B5 tail) — coach first

- **Scope v1: coach `ClientScheduleCalendar` (week view), 1:1 canonical clones only.** Client self-move + team-shared plans deferred (team edits stay in the team board; add a v2 note). Ad-hoc "inject a one-off" is NOT in this slice — coach already has `DirectClientCalendar` for that; wiring it into B5's calendar is its own small follow-up.
- Affordance: session card kebab → **"Move to another day…"** → 7-day picker for that calendar week → if later-week matches exist, the same cascade prompt (§2 wording).
- Mutation: new SECURITY DEFINER RPC (deload-RPC precedent — the calendar must not load board state):

```sql
move_plan_session(p_session_id uuid, p_new_day_index int, p_apply_following_weeks boolean DEFAULT false)
RETURNS JSONB  -- { moved: n, weeks: [week_index...] }
```

  - Resolves the session → plan → gate: caller is plan `owner_coach_id` OR primary coach of an assignee OR admin. **Reject team-shared plans** (any active `client_plan_assignment` on this plan with `team_id IS NOT NULL`) with a distinct error the UI maps to "Edit the team plan from the team board".
  - Moves the session; when `p_apply_following_weeks`, applies the §1 matcher via SQL over the plan's later weeks.
  - Hygiene: `p_`/`v_`, `SET search_path = public`, one CREATE FUNCTION per migration file, REVOKE PUBLIC/anon + GRANT authenticated (real auth gate internal — `auth.uid()`), CHECK 1 ≤ p_new_day_index ≤ 7.
- Refresh: re-run `loadCanonicalSchedule` after success (deload pattern); toast with the RPC's moved-count.

## 4. Out of scope (explicit)

Drag-and-drop on the calendar (picker-menu move only, v1); client self-service calendar move; team-shared calendar move; inject-one-off wiring; any `direct_calendar_sessions` change; any legacy `client_programs*` path (P5 soak — zero legacy writes).

## 5. Verify (Cowork, post-merge)

1. Board (client skin, +online clone 093cee67): move W1 Fri→Sat with "All following weeks" → `plan_sessions.day_index` updated in every later week with a match; W-eks without a match untouched; slot ids unchanged (spot-check a slot id before/after); logs still attached.
2. Board "This week only" → only that week's row changes.
3. Coach calendar (B5, +online): move next week's session via RPC path → calendar re-renders on new day; client Today card / WorkoutCalendar follow (same schedule adapter).
4. Team guard: RPC against Fe Squad's shared clone `c692ff67` → rejected with the team-board error.
5. Soak invariant: `client_programs` count still 8; `client_plan_overrides` still 0.
6. RPC hygiene: anon call → 42501.
