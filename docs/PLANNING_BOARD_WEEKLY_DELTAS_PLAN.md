# Planning Board — Weekly Deltas (Per-Field Auto-Prescribe)

> Status: planning only. No code yet. Owner decisions baked in from chat —
> see "Decisions baked in" below. Builds on the existing Planning Board
> (`MuscleBuilderPage` + `useMuscleBuilderState`); Phases 0-5 need no DB /
> RPC / migration. Phase 6 (client-initiated deload) is a separate PR with
> one new table and two edge functions.

---

## TL;DR

**What.** Per-field "weekly change" rules on the Planning Board. Coach sets
W1 prescriptions normally, then attaches small delta rules — `"RIR -1/wk"`,
`"load +2.5 kg/wk"`, `"ecc tempo digit -1/wk"`. Engine resolves W2-WN values
automatically from the W1 base. Hand-edits on any week become protected
manual overrides and survive future recomputes.

**Add Week.** Today's single deep-clone button becomes a 3-mode dropdown:
*Same workouts + apply rules* / *Clone verbatim* / *Fresh blank*. Default
flips to *apply rules* once any rule exists on the program.

**Deload.** "Mark as Deload" stops doing today's hardcoded 60% set reduction
and opens a dialog — pick base content (clone from W[X] / fresh blank /
keep current) and a preset (Volume / Intensity / Recovery / Custom). The
old 60% behavior becomes the *Volume* preset. Clients can request deloads
off-schedule from their dashboard; the primary coach gets an email +
in-app notification and approves with a preset.

**Size.** ~8.5 days across 7 phases.
- Phases 0-4 (MVP rule engine): ~4.5 days, ships standalone.
- Phase 5 (coach deload dialog): ~1 day, still no DB.
- Phase 6 (client-initiated deload, separate PR): ~3 days, new table + two
  edge functions + cross-role UI.

**Read for tomorrow.** Sections in order: Decisions baked in (D1-D14), §1-§8
(engine + state + UI + safety + rollout), §9-§10 (deload coach + client),
§14 (suggestions I'd flag), §13 (4 remaining decisions you owe me — none
block kickoff).

---

## Problem

Multi-week programs today: coach builds W1, hits **Add Week**, gets a verbatim
deep clone (`useMuscleBuilderState.ts:243-262`). Any deviation — load climb, RIR
taper, tempo drop, set bumps — has to be retyped per exercise per day per week.
The Progression tab (`ProgressionOverview.tsx`) lets coaches propagate the
free-text `exercise.instructions` field across weeks but does nothing for the
numeric prescription (`sets`, `repMin/Max`, `tempo`, `rir`, `rpe`, `setsDetail`).

## Reframe

"Progression" → "Change to the prescription." A coach attaches one or more
**delta rules** to a field on a W1 slot ("ecc tempo digit -1 per week"). The
engine resolves W2+ values from W1 base + delta + week offset. Coaches can
still hand-edit any cell on W2+ (overrides win; clobbered cells are tagged
`manual override` and reversible).

## Decisions baked in

| Decision | Resolution |
|---|---|
| D1. Tempo cap | Numeric tempo digits clamp at `[0, 9]` (single-char visual stays). |
| D2. A / X tokens | Coach-set per position. Engine NEVER auto-converts digits ↔ letters. Numeric rule on a letter position skips that week + surfaces a badge. |
| D3. RIR / RPE scope | Both shipped: `all sets`, `first set`, `last set`, `set #N`. No default — coach picks per rule. |
| D4. Add Week modes | Three: (a) `apply rules`, (b) `clone verbatim`, (c) `fresh blank`. Default flips to (a) once any rule exists on the program; (b) otherwise (matches current muscle memory). |
| D5. Fresh week | Fully blank — no sessions, coach builds from scratch. |
| D6. Recompute on W1 edit | Manual button, not auto. Coach controls when downstream regenerates. Hand-edits on W2+ stay protected via `manualOverrides`. |
| D7. Storage | Resolve-at-write — W2+ get concrete values written into existing slot fields. `deltaRules` and `manualOverrides` are added to `MuscleSlotData`. No DB schema change (rides in `slot_config` JSONB). |
| D8. Conversion | `convert_muscle_plan_to_program_v2` unchanged — it reads resolved slot values, never sees the rule metadata. |
| D9. Deload customization | Toggling "Mark as Deload" opens a dialog: base content (clone from W[X] / fresh blank / keep current) + optional deload preset (Volume / Intensity / Recovery / Custom). Today's hardcoded 60% set reduction becomes the "Volume deload" preset, no longer baked in. |
| D10. Client-initiated deload | New surface: client requests a deload from their dashboard. New `deload_requests` table + edge function `send-deload-request-email` notifies coach. Coach approves (with preset) / declines / schedules later week. Throttled to one pending request per client. |
| D11. Default rule amount (Q1) | Pre-fill sensible per-field defaults: tempo `-1`, load `+2.5 kg`, RIR `-1`, sets `+1`, reps `+1`. Coach can change before saving. |
| D12. Same-field stacking (Q2) | Forbid. Adding a second rule to a field that already has one shows "Replace? / Edit existing?" — no additive interactions. |
| D13. Bounded active ranges (Q3) | Defer to follow-up PR. Engine supports it cheaply; ship MVP without the UI cost. |
| D14. W1 edit auto-recompute (Q4) | Strictly manual. "W1 changed since last recompute" subtle banner on the Across Weeks tab makes the gap visible without surprise. |

---

## 1. Engine — `weeklyDeltaEngine.ts`

New file: `src/components/coach/programs/muscle-builder/weeklyDeltaEngine.ts`.

### 1.1 Rule shape (discriminated union)

```ts
export type DeltaTarget =
  | 'sets' | 'repMin' | 'repMax' | 'tempo'
  | 'rir' | 'rpe' | 'rest_seconds' | 'instructions';

export type SetScope =
  | { kind: 'all' }
  | { kind: 'first' }
  | { kind: 'last' }
  | { kind: 'index'; setNumber: number };  // 1-indexed

export type WeeklyDeltaRule =
  | { id: string; target: 'sets';           op: 'add';     amount: number }   // +1/wk
  | { id: string; target: 'repMin' | 'repMax'; op: 'add';  amount: number }
  | { id: string; target: 'rir' | 'rpe';    op: 'add';     amount: number; scope: SetScope }
  | { id: string; target: 'rest_seconds';   op: 'add';     amount: number; scope: SetScope }
  | { id: string; target: 'tempo';          op: 'digit_add'; position: 0|1|2|3; amount: number }
  | { id: string; target: 'instructions';   op: 'append';  text: string }
  | { id: string; target: 'instructions';   op: 'replace_per_week'; texts: string[] };  // index by weekOffset
```

Each rule also carries:

```ts
interface DeltaRuleCommon {
  id: string;                       // crypto.randomUUID()
  deload: 'skip' | 'apply' | 'invert' | 'fixed';
  deloadFixedValue?: number;        // only when deload === 'fixed'
  activeWeekStart?: number;         // default 2 (W2). Bounded ranges later.
  activeWeekEnd?: number;
}
```

### 1.2 `applyRule(rule, base, weekOffset, isDeload) → Result`

```ts
type ApplyResult =
  | { ok: true; value: number | string }
  | { ok: false; skipped: true; reason: 'literal_token' | 'out_of_range' | 'deload_skip' | 'no_base' };
```

Per-target arithmetic (cap rules in the engine, never in the UI):

- **`sets`**: `clamp(base + amount * weekOffset, 1, 20)`.
- **`repMin` / `repMax`**: `clamp(base + amount * weekOffset, 1, 50)`. Engine
  validates `repMin <= repMax` after a paired rule; if not, returns
  `out_of_range` and the UI surfaces a warning.
- **`tempo`**: parse string into 4 positions. Each position is `digit` (0-9)
  OR `literal` (`A` / `X`). For the rule's position:
  - if `literal` → `{ ok: false, skipped, reason: 'literal_token' }`
  - else → `clamp(digit + amount * weekOffset, 0, 9)`. Re-serialize.
- **`rir` / `rpe`**: when `setsDetail` is present and scope ≠ `all`, mutate
  the targeted set only. When scope = `all` or `setsDetail` is empty, mutate
  the slot-level field. Clamps: RIR `[0, 10]`, RPE `[1, 10]` (half-steps OK).
- **`rest_seconds`**: clamp `[0, 600]`.
- **`instructions` append**: `base + '\n' + text` (skip on blank base).
- **`instructions` replace_per_week**: `texts[weekOffset - 1] ?? base`.

Deload behavior runs **before** the arithmetic:

- `skip` → return `{ ok: false, skipped, reason: 'deload_skip' }`, week keeps base.
- `apply` → run rule normally.
- `invert` → multiply `amount` by -1.
- `fixed` → ignore rule, write `deloadFixedValue`.

### 1.3 `resolveSlotForWeek(baseSlot, rules, weekOffset, isDeload) → MuscleSlotData`

Compose all rules. Returns the W2+ slot with resolved fields, plus a
`derivedFields: DeltaTarget[]` so the UI can render the "auto" chip.

### 1.4 Tests — `weeklyDeltaEngine.test.ts`

Same folder. Cases at minimum:

- Sets: `+1/wk` from base 3 → W2=4, W3=5; cap at 20.
- Reps: `repMin +1, repMax +1` keeps the range width.
- Tempo: digit-add `pos=0, amount=-1` on `"3010"` → `"2010"`, `"1010"`, `"0010"`, then sticks at `"0010"`. On `"A010"` → skipped + reason `literal_token`.
- RIR all-sets `-1` from base 3 → 2, 1, 0; clamps at 0.
- RIR last-set on `setsDetail` of length 4 → only `set_number = 4` changes.
- Deload modes: skip / invert / fixed all behave per spec on a marked week.
- Compose two rules on same slot (load +2.5kg + RIR -1) → both apply, independent.

---

## 2. Type changes — `src/types/muscle-builder.ts`

Add to `MuscleSlotData`:

```ts
deltaRules?: WeeklyDeltaRule[];     // Only meaningful on W1 slots.
manualOverrides?: DeltaTarget[];    // Fields hand-edited on W2+ that recompute must NOT clobber.
```

Both optional → backward compat. Existing templates load and behave exactly as
today (no rules, no recompute, no UI noise).

`MuscleSlotData.deltaRules` lives on W1 because rules describe the W1→W2+
delta. Storing it elsewhere is ambiguous when coaches re-prescribe mid-mesocycle.
For bounded ranges (e.g. rule only active W2-W4), we use
`activeWeekStart` / `activeWeekEnd` on the rule itself.

---

## 3. Reducer changes — `useMuscleBuilderState.ts`

### 3.1 New actions

```ts
| { type: 'ADD_WEEK_WITH_RULES' }   // mode (a)
| { type: 'ADD_WEEK_BLANK' }        // mode (c)
| { type: 'SET_SLOT_DELTA_RULES'; slotId: string; rules: WeeklyDeltaRule[] }
| { type: 'RECOMPUTE_DOWNSTREAM_FROM_DELTAS'; slotId?: string }  // omit slotId = all W1 slots
| { type: 'MARK_FIELD_MANUAL_OVERRIDE'; slotId: string; field: DeltaTarget }
| { type: 'CLEAR_FIELD_MANUAL_OVERRIDE'; slotId: string; field: DeltaTarget }
```

Existing `ADD_WEEK` (mode b) stays — verbatim clone, no rule pass.

### 3.2 `ADD_WEEK_WITH_RULES` reducer logic

1. Deep-clone last week (same as today's `ADD_WEEK`).
2. For each W1 strength slot with `deltaRules`, find the matching slot in the
   new week (matched by `dayIndex` + `sortOrder`, same algorithm as
   `APPLY_SLOT_TO_REMAINING`).
3. Call `resolveSlotForWeek(baseSlot, rules, newWeekOffset, isDeload)` → write
   resolved fields onto the new-week slot.
4. Preserve `manualOverrides` set from the cloned slot (W2+ overrides on a
   previous week should NOT propagate to W3+ — overrides are week-local).

### 3.3 `ADD_WEEK_BLANK`

Append `{ slots: [], sessions: [], label: undefined, isDeload: false }` to
`state.weeks`. Coach builds from scratch.

### 3.4 `RECOMPUTE_DOWNSTREAM_FROM_DELTAS`

For each week index 1..N-1 (skipping W1):

1. For each slot the slotId argument matches (or all W1 slots if undefined),
   find the matching W2+ slot.
2. For each field in the resolved value, write it ONLY if that field is NOT
   in `manualOverrides`. Overrides win.
3. Re-emit `derivedFields` so the UI badges refresh.

### 3.5 Manual override tracking

Any reducer action that writes a slot field on a W2+ slot (`SET_SLOT_DETAILS`,
`SET_SETS`, `SET_REPS`, `SET_EXERCISE_INSTRUCTIONS`, per-set `UPDATE_SET_DETAIL`)
must add the touched `DeltaTarget` to the slot's `manualOverrides`. This is
how recompute knows to skip those fields.

Clearing the override (clicking the "manual" badge) removes the field from
the set and immediately re-runs the rule for that single field.

---

## 4. UI changes

### 4.1 `WeekTabStrip.tsx` — Add Week dropdown

Today: single `+` button calls `onAddWeek`.

New: `+` button opens a dropdown menu:

- **Same workouts, apply rules** (only enabled if any W1 slot has `deltaRules`)
- **Clone last week**
- **Fresh blank week**

Default click target (no rules anywhere) → `Clone last week`. Default click
target (rules exist) → `Same workouts, apply rules`. Coach can pick the other
two from the dropdown caret.

### 4.2 `MuscleSlotCard.tsx` (W1 only) — "Change per week" accordion

Inside the existing popover (`MuscleSlotCard.tsx:1-80` shows the prop surface),
add a collapsed section below the prescription rows. Visible only when the
slot's week index is 0.

For each field the slot has (sets, reps, tempo digit positions, rir, rpe,
rest), surface a per-field rule editor:

- Field name + current base value.
- **Direction** (+ / -) + **amount per week** input.
- **Scope** picker (RIR/RPE/rest only): all sets / first / last / set #N.
- **Deload** picker: skip / apply / invert / fixed (+ value when fixed).
- **Live preview strip**: `W1=3 → W2=2 → W3=1 → W4=0`. Shows literal-token
  skips inline (`W2: ⚠ skipped (A on ecc)`).

Each rule has its own row inside the accordion. "+ Add rule" adds another.
Multiple rules on different fields compose; multiple rules on the SAME field
stack additively (warn the coach inline).

### 4.3 W2+ derived cells — chip + override flow

On `MuscleSlotCard.tsx` when `weekIndex > 0`:

- Each field reads its `derivedFields` flag (held on the slot after `LOAD_TEMPLATE` and after every recompute action).
- Derived field → small `auto` chip (gray, 10px text) next to the value.
  Hover: "From W1 rule: -1 ecc tempo digit per week."
- Coach types into the field → `MARK_FIELD_MANUAL_OVERRIDE` dispatches, chip
  flips to `override` (amber). Hover: "Manual override. Click to revert to
  rule-derived (current rule would give: 0010)."
- Click the override chip → `CLEAR_FIELD_MANUAL_OVERRIDE` + single-field
  recompute.

### 4.4 `ProgressionOverview.tsx` — rename + badges

Rename label to **"Across Weeks"** (file name stays for git history sanity).
Each cell in the multi-week arc shows the same `auto` / `override` chips as
the slot card. Add a single top-of-tab button: **"Recompute downstream"** —
dispatches `RECOMPUTE_DOWNSTREAM_FROM_DELTAS` with no slotId (all slots).
Useful after editing a W1 base value when rules already exist.

### 4.5 New file — `SlotDeltaRuleEditor.tsx`

Single rule row UI extracted for testability and reuse between the slot card
and the Across Weeks tab. Props:

```ts
interface SlotDeltaRuleEditorProps {
  rule: WeeklyDeltaRule;
  baseValue: number | string;
  totalWeeks: number;
  onChange: (rule: WeeklyDeltaRule) => void;
  onRemove: () => void;
}
```

---

## 5. Conversion safety

`convert_muscle_plan_to_program_v2(...)` (migration
`20260419100000_convert_rpc_v2_sessions.sql`) reads `slot_config` JSONB,
walks `weeks[].slots[]`, and inserts one `module_exercise` per strength slot
per day. It uses resolved `sets`, `repMin/Max`, `tempo`, `rir`, etc. — never
touches `deltaRules` or `manualOverrides`.

Because we resolve-at-write, every W2+ slot already has the final concrete
values. The RPC sees the same shape it always did. **No conversion change
needed.** Verified by re-reading the RPC against the new fields.

---

## 6. Backward compat

- Loading an existing template (no `deltaRules`, no `manualOverrides`): every
  reducer path behaves exactly as today.
- Saving a template that uses rules: `slot_config` JSONB carries the new
  fields. Old clients (mid-deploy) deep-clone with extra fields they ignore.
  No risk because no other consumer reads `deltaRules`.
- The legacy `ProgramCalendarBuilder.tsx` (DB-backed older builder) is NOT
  touched. Coaches there use the existing per-week Copy dialog.

---

## 7. Phased rollout

| Phase | Scope | Days |
|---|---|---|
| **0 — Engine** | `weeklyDeltaEngine.ts` + unit tests. No UI, no reducer. Lands behind dead code, tests pass in CI. | 1 |
| **1 — State** | Type changes + new reducer actions + 3-mode `WeekTabStrip` dropdown. No per-field editor yet — only "clone verbatim" still works through the dropdown. | 1 |
| **2 — Slot card editor** | `SlotDeltaRuleEditor` + accordion in `MuscleSlotCard`. Coach can author rules on W1, but no recompute / derived UI yet. Author + see the live preview strip. | 1 |
| **3 — Recompute + chips** | Recompute action, `manualOverrides` tracking on all slot-mutating actions, `auto` / `override` chips on W2+ cells, "Recompute downstream" button on Across Weeks tab. End-to-end usable. | 1 |
| **4 — Polish** | Bulk "apply rule to all slots in session/day", empty states, accordion icons. `npm test` + manual smoke of Planning Board + conversion to program. | 0.5 |
| **5 — Deload customization (§12)** | Replace hardcoded 60% reduction with deload dialog: base-content picker + preset picker (Volume / Intensity / Recovery / Custom) + live preview. Built-in presets exposed as `WeeklyDeltaRule[]` collections. | 1 |
| **6 — Client-initiated deload (§13)** | New `deload_requests` table + RLS migration. Edge function `send-deload-request-email`. Client `DeloadRequestButton` on active program card. Coach badge on `CoachMyClientsPage` + new `DeloadRequestsTab` (or merge into `MessagesTab` notifications). Throttle: one pending request per client. | 3 |

Total: **~8.5 days**. Phases 0-4 are the MVP rule engine (~4.5 days, ships
standalone — coaches get auto-prescribe + 3-mode Add Week). Phase 5 is
self-contained on the coach side (~1 day). Phase 6 is a separate PR — DB
migration + edge function + cross-role UI (~3 days). Recommend shipping in
that order; nothing in 5 or 6 blocks the MVP.

Each phase is independently shippable behind the existing Planning Board (no
waitlist gate or feature flag needed because rules are opt-in per slot and
modes (b) / (c) are no-ops without rules).

---

## 8. Risks + mitigations

| Risk | Mitigation |
|---|---|
| State complexity blows up — `deltaRules` + `manualOverrides` + recompute interacting with per-set `setsDetail`. | Engine is pure functions, fully unit-tested in Phase 0 before any UI lands. `manualOverrides` is a flat `DeltaTarget[]`, no nested override tracking. |
| Coach changes W1, forgets to recompute → silent drift. | "Recompute downstream" button on Across Weeks; "W1 changed since last recompute" subtle banner on Across Weeks header when W1 has been mutated after recompute. |
| Tempo letter rules — coach sets a rule on a position that's currently `A`, doesn't understand why W2 didn't change. | Engine returns `skipped: reason='literal_token'`, live preview strip + W2 cell both show "⚠ skipped (A on ecc)" with hover explanation. |
| Coaches accidentally trash careful manual overrides by clicking Recompute. | Recompute respects `manualOverrides` per-field. Test case in Phase 0 covers this. |
| Multiple rules stacking on one field (e.g. coach adds RIR -1 then RIR -2). | Stack additively + warn inline. Coach can delete the duplicate from the slot card. |
| `slot_config` JSONB bloat with rules attached to many slots. | Per-slot rules are typically 1-3 small objects. Even at 50 slots × 3 rules × ~150 bytes = 22.5 KB — well under any practical JSONB limit. |

---

## 9. Deload customization (Phase 5)

Replaces today's `TOGGLE_DELOAD` behavior, which hardcodes a 60% set
reduction (`useMuscleBuilderState.ts:277-289`). That auto-reduction is
prescriptive — coaches who want a different deload style (intensity drop,
recovery week, custom volume) currently work around it.

### 9.1 Flow

`WeekTabStrip` "Mark as Deload" menu item opens a dialog:

```
┌─ Make this a Deload Week ─────────────────────────────┐
│                                                        │
│ Base content:                                          │
│  ◉ Clone from week [W2 ▾]                              │
│  ○ Fresh blank week                                    │
│  ○ Keep current week content                           │
│                                                        │
│ Apply deload preset:                                   │
│  ◉ Volume deload   (sets -40%, RIR +1)                 │
│  ○ Intensity deload (load -20%, RIR +2)                │
│  ○ Recovery deload (sets -50%, load -30%, RIR +2)      │
│  ○ Custom (add your own delta rules)                   │
│  ○ None (just flag the week, don't change content)     │
│                                                        │
│ ── Preview ─────────────────────────────────────────── │
│  Bench Press   3×8-12 → 2×8-12, RIR 3→4               │
│  Back Squat    4×6-8  → 2×6-8,  RIR 2→3               │
│  ... 8 more slots                                      │
│                                                        │
│             [Cancel]   [Apply Deload]                  │
└────────────────────────────────────────────────────────┘
```

### 9.2 Implementation

Built-in presets are plain `WeeklyDeltaRule[]` collections exported from a
new `deloadPresets.ts`:

```ts
export const VOLUME_DELOAD: WeeklyDeltaRule[] = [
  { id: 'vol-sets', target: 'sets', op: 'add', amount: 0, /* uses pct in engine */ ... },
  { id: 'vol-rir', target: 'rir', op: 'add', amount: 1, scope: { kind: 'all' }, ... },
];
```

Apply pipeline (one-shot, NOT recurring like progression rules):

1. Resolve base content (clone source / blank / keep) — produces the working
   slot set.
2. Run each preset rule once via `applyRule(rule, base, weekOffset=1, isDeload=true)`.
3. Write resolved slots into the target week, mark `isDeload = true`.
4. Mark all touched fields as `manualOverrides` so the recurring progression
   rules from W1 don't re-clobber them.

Custom deload: same UI as the per-slot delta rule editor (§4.2), one-shot
apply instead of recurring.

### 9.3 Migration safety

Existing programs with `isDeload: true` weeks keep their content as-is. The
old `TOGGLE_DELOAD` action stays for backward compat (renamed
`TOGGLE_DELOAD_FLAG`), but the new flow always goes through the dialog. No
data migration.

### 9.4 New files / edits

NEW:

- `src/components/coach/programs/muscle-builder/deloadPresets.ts`
- `src/components/coach/programs/muscle-builder/DeloadDialog.tsx`

EDIT:

- `useMuscleBuilderState.ts` — add `APPLY_DELOAD` action, retire the
  hardcoded 60% reduction inside `TOGGLE_DELOAD`.
- `WeekTabStrip.tsx` — "Mark as Deload" opens the dialog instead of dispatching.

---

## 10. Client-initiated deload requests (Phase 6 — separate PR)

Coach-planned deloads (§12) are the dominant case, but clients sometimes
need one off-schedule (illness, travel, sleep debt). This adds a request
flow with mandatory coach notification.

### 10.1 Client side

`src/components/client/DeloadRequestButton.tsx` mounts on the active program
card on the client dashboard. Disabled when:

- No active subscription / program
- A pending request already exists for this client
- Coach declined a request in the last 7 days (cool-off)

Confirmation dialog: "Request a deload week from your coach? They'll be
notified and respond shortly. You can add a note explaining how you've been
feeling." Optional textarea (max 500 chars).

On submit: INSERT into `deload_requests`, fire-and-forget the edge function.

### 10.2 Coach side

- **Badge** — `CoachMyClientsPage` shows a destructive count per client with
  pending requests (reuses the `useStaffUnreadCounts` pattern).
- **Inline panel** — new section on the Client Overview shell at
  `/coach/clients/:clientUserId?tab=overview` showing pending requests
  inline. Coach actions:
  - **Approve now** — opens the §12 deload dialog scoped to the client's
    current week, applies on confirm, sets `status='approved'`.
  - **Schedule for week …** — opens dialog scoped to a future week.
  - **Decline** — textarea for response message, sets `status='declined'`,
    starts the 7-day cool-off.

### 10.3 DB migration

```sql
-- supabase/migrations/2026MMDDHHMMSS_deload_requests.sql

CREATE TABLE deload_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_message TEXT CHECK (char_length(client_message) <= 500),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'expired')) DEFAULT 'pending',
  coach_user_id UUID REFERENCES auth.users(id),
  coach_responded_at TIMESTAMPTZ,
  coach_response_message TEXT CHECK (char_length(coach_response_message) <= 500),
  approved_week_offset INT,         -- which week from client's program got the deload
  applied_preset_id TEXT,           -- 'volume' | 'intensity' | 'recovery' | 'custom'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX deload_requests_client_status_idx
  ON deload_requests(client_id, status);
CREATE INDEX deload_requests_coach_pending_idx
  ON deload_requests(coach_user_id, requested_at DESC)
  WHERE status = 'pending';

ALTER TABLE deload_requests ENABLE ROW LEVEL SECURITY;

-- Client: SELECT + INSERT own only
CREATE POLICY "client_select_own_deload_requests" ON deload_requests
  FOR SELECT TO authenticated USING (client_id = auth.uid());
CREATE POLICY "client_insert_own_deload_requests" ON deload_requests
  FOR INSERT TO authenticated WITH CHECK (client_id = auth.uid());

-- Primary coach + care team: SELECT + UPDATE
CREATE POLICY "coach_select_deload_requests" ON deload_requests
  FOR SELECT TO authenticated USING (
    public.is_primary_coach_for_user(auth.uid(), client_id)
    OR public.is_care_team_member_for_client(auth.uid(), client_id)
    OR public.is_admin(auth.uid())
  );
CREATE POLICY "coach_update_deload_requests" ON deload_requests
  FOR UPDATE TO authenticated USING (
    public.is_primary_coach_for_user(auth.uid(), client_id)
    OR public.is_care_team_member_for_client(auth.uid(), client_id)
    OR public.is_admin(auth.uid())
  );

-- Service role for edge function
CREATE POLICY "service_role_all_deload_requests" ON deload_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
```

Throttle (DB constraint): partial unique index preventing two pending
requests per client.

```sql
CREATE UNIQUE INDEX deload_requests_one_pending_per_client
  ON deload_requests(client_id) WHERE status = 'pending';
```

### 10.4 Edge function — `send-deload-request-email`

Pattern: same as `send-coach-client-message-email`. Deploy with
`--no-verify-jwt`, internal JWT validation, role check.

- Fires from client `DeloadRequestButton` after the INSERT succeeds.
- Throttle: trivial — DB constraint already forbids a second pending request
  while one is open, so the edge function doesn't need its own dedup window.
- Email FROM: `EMAIL_FROM_IGU` (per `_shared/config.ts`).
- Uses shared `_shared/{emailTemplate,emailComponents,sendEmail}.ts`.
- Subject: `"{ClientFirstName} requested a deload week"`.
- Body: client's message (if any) + CTA button → `/coach/clients/:clientId?tab=overview`.
- Use `--` not `—` in copy.
- Add to the JWT table in `CLAUDE.md`.

A second edge function `send-deload-response-email` fires when the coach
approves / declines / schedules, notifying the client.

### 10.5 Notification surfaces

- **Coach email** — primary, via edge function above.
- **Coach in-app** — count on `CoachMyClientsPage` + inline panel on Client
  Overview `?tab=overview` (no new full-page route needed).
- **Coach push** (deferred) — would require service worker setup; out of
  scope.
- **Client email on response** — second edge function fires when status
  flips off `pending`.

### 10.6 New files / edits (Phase 6)

NEW:

- `supabase/migrations/2026MMDDHHMMSS_deload_requests.sql`
- `supabase/functions/send-deload-request-email/index.ts`
- `supabase/functions/send-deload-response-email/index.ts`
- `src/components/client/DeloadRequestButton.tsx`
- `src/components/coach/clients/DeloadRequestPanel.tsx`
- `src/hooks/useDeloadRequests.ts` (client side — own requests)
- `src/hooks/useCoachDeloadRequestCounts.ts` (coach side — batch counts per
  client, mirrors `useStaffUnreadCounts`)

EDIT:

- `src/pages/CoachClientOverview.tsx` — slot the panel into `OverviewTab`
  when there's a pending request.
- `src/pages/CoachMyClientsPage.tsx` — render destructive badge from the
  batch hook.
- `CLAUDE.md` — JWT table + Scheduled Automation table if any cron lands.

NO CHANGES:

- The MVP rule engine (Phases 0-4). Phase 6 only consumes the deload preset
  pipeline from §12 — it doesn't depend on or modify the per-slot
  progression rule engine.

### 10.7 Edge cases

- Client requests deload, coach takes 4 days to respond — client may have
  already started the week. Coach's "Apply to current week" overwrites
  in-flight days but only future days (don't retroactively change logged
  workouts). Coach's "Schedule for week N" is safer for partially-logged
  weeks.
- Client cancels their own request before coach responds — allowed via a
  cancel button on the request card. Sets `status='expired'`.
- Coach declined within 7 days — client sees "Your last request was
  declined on {date}. You can request again on {date+7}." (cool-off
  prevents request spam without blocking legitimate follow-ups.)
- Multi-coach client (care team) — only the **primary coach** gets the
  email notification (avoids duplicate emails). Care team can still see +
  respond from the UI; whoever responds first locks the request.

---

## 11. Out of scope (post-launch followups)

- Persisted "rule preset library" — save a named rule set and reuse across
  programs ("Senior linear hypertrophy block").
- Cross-slot rule application — "apply tempo rule to every Bench Press slot
  in this program." Once per-slot is solid, easy extension.
- Translation of deltas into client-side `progressionEngine` config so live
  workouts inherit the prescribed taper. Different domain — separate PR.
- Touching the legacy `ProgramCalendarBuilder` (older DB-backed builder).
  Planning Board is canonical for new programs; the older path stays as-is.

---

## 12. File touch list

NEW:

- `src/components/coach/programs/muscle-builder/weeklyDeltaEngine.ts`
- `src/components/coach/programs/muscle-builder/SlotDeltaRuleEditor.tsx`
- `src/components/coach/programs/muscle-builder/__tests__/weeklyDeltaEngine.test.ts`

EDIT:

- `src/types/muscle-builder.ts` — add `WeeklyDeltaRule`, `DeltaTarget`,
  `SetScope`, slot fields.
- `src/components/coach/programs/muscle-builder/hooks/useMuscleBuilderState.ts`
  — new actions + `manualOverrides` tagging in existing actions.
- `src/components/coach/programs/muscle-builder/MuscleBuilderPage.tsx` — wire
  dispatch for new actions.
- `src/components/coach/programs/muscle-builder/WeekTabStrip.tsx` — Add Week
  dropdown menu.
- `src/components/coach/programs/muscle-builder/MuscleSlotCard.tsx` —
  accordion on W1, chips on W2+.
- `src/components/coach/programs/muscle-builder/ProgressionOverview.tsx` —
  rename label, chips per cell, "Recompute downstream" button.

NO CHANGES:

- DB schema, migrations, RPCs, edge functions.
- `convert_muscle_plan_to_program_v2` — reads resolved values, untouched.
- `ProgramCalendarBuilder.tsx` (legacy DB-backed builder).
- Client-side `progressionEngine.ts` (runtime suggestions are a separate domain).

---

## 13. Open questions for Hasan before kickoff

All four Q1-Q4 questions from the prior plan version are resolved in §D11-D14
above. Remaining open items, specific to the new deload sections:

1. **Deload preset names** — `Volume / Intensity / Recovery` covers the
   common cases. Want a fourth canonical preset (e.g. "Mobility/recovery"
   that switches sessions to mobility rather than just dropping volume)?
   Or save that for the post-launch preset library?
2. **Cool-off window for client deload requests** (§13.7) — current plan is
   7 days after a decline. Too long / too short / make it coach-configurable?
3. **Care team email behavior on client request** — current plan: only the
   **primary coach** gets the email. The dietitian / physio see it in the
   UI but don't get pinged. OK?
4. **Conversion-time deload metadata** — `convert_muscle_plan_to_program_v2`
   currently doesn't propagate `isDeload` to the resulting `program_template`
   structure (deload is purely a Planning Board concept right now). For
   client-side deload request approval to know which weeks ARE deloads,
   we'd want to write the flag into `client_programs` / `client_day_modules`.
   That's a small adjacent RPC change. Ship in Phase 5 or defer to Phase 6?

---

## 14. Suggestions (mine, for your review)

These are MY recommendations beyond what we've explicitly agreed. Each one
is independent — cherry-pick whatever you want to fold in. None block the
MVP.

### A. Program-level rule defaults (post-MVP follow-up)

Coaches who run linear-style programs put the same delta on every strength
slot ("load +2.5 kg/wk on everything"). A program-level "default
progression" panel that auto-attaches a rule to every NEW slot would save
10+ clicks per program. Per-slot rules still override the default.

Lives next to the existing global prescription columns config in
`MuscleBuilderPage`. Stored in `slot_config.globalDeltaRules`. Cheap.

### B. Show clients the progression they're on

When a client opens W3 of their program, the slot card could read:

> **Bench Press** — 3 × 6-8, RIR 1 *(down from 3 in W1)*

Instead of just `RIR 1`. Tiny header line that surfaces the trend.
Anecdotally improves adherence because clients see the plan working — they
know W3 is supposed to feel harder. Small `WorkoutSessionV2.tsx` addition;
no engine changes (the resolved value is already in the slot).

### C. Save coach-defined deloads + rules as reusable presets

Phase 5 ships three built-in deload presets. Coaches will quickly want their
own ("Hasan deload v2 — only drops accessories"). The DB pattern exists
already in `coach_column_presets`. Mirror it:

- `coach_deload_presets(coach_id, name, rules JSONB, created_at)`
- `coach_progression_presets(coach_id, name, rules JSONB, created_at)`

Coach saves from the deload dialog / rule editor with a "Save as preset"
button, picks from a dropdown on the next program. Post-MVP, ~2 days of
work.

### D. Per-set scope for load rules

RIR / RPE rules already have set-scoped options (`all` / `first` / `last` /
`set #N`). Load rules don't — they apply slot-wide. Pyramid set programming
is common enough to support: *"top set climbs 2.5 kg/wk, back-off sets stay
at the same weight"*. Cheap engine extension (the SetScope type already
exists), UI cost is one more selector in the load rule editor. Either fold
into Phase 2 or follow-up PR.

### E. Telemetry to validate the friction was real

Once shipped, log:
- Which Add Week mode is used (`apply_rules` / `clone` / `fresh`)
- Which rule targets are most common (tempo / load / RIR / etc.)
- How often the recompute button gets pressed
- Whether coaches actually use the deload presets or just pick "None — just
  flag the week"

Cheap PostHog-style event or a `coach_planning_actions` audit table. If 80%
of coaches still pick "clone verbatim" after a month and never set a rule,
we built the wrong thing — better to know in week 4 than month 4.

### F. "Schedule for week N" must respect logged days

When coach approves a deload request with `approved_week_offset = 4`, they
shouldn't be able to overwrite W4 if the client has already logged Mon-Wed
of that week. UI guard: gray out partially-logged weeks in the picker with
"You've already logged 3 sessions this week — pick a future week or apply
to today forward only." Phase 6 acceptance criterion, not negotiable.

### G. Decline-count visibility on client requests

The partial unique index forbids two pending requests, but a client can
loop: request → coach declines → wait 7 days → request → repeat. The coach
panel should show "This is the 4th request in the past 60 days" so they
can have a real conversation about whether the program fits. One `count(*)`
query when loading the panel; no schema change.

### H. "Reset week to derived" action

On a W2+ slot with several manual overrides, clicking each chip
individually to revert is tedious. Add a "Reset all overrides on this week"
button at the top of the week (or per-slot menu). One reducer action,
~30 lines of code. Phase 4 polish.

### I. Exercise swap with active rules — be explicit

If the coach swaps Bench → Incline Bench on a W1 slot that has rules
attached, the rules continue applying to whatever exercise sits in that
slot — rules are field-level, not exercise-level. Probably the right
behavior, but the slot card should surface a one-time tooltip the first
time it happens:

> *"Rule continues to apply to the new exercise. Edit or remove the rule if
> the progression should change."*

Avoids surprise. Stored in localStorage so it shows once per coach.

### J. Two niceties I'd push to post-launch

- **Rule library across programs** — coach-level saved rule presets that
  appear in every new program ("My standard hypertrophy block"). Mirrors C
  above for progression rules.
- **AI-suggest a progression** — "Looking at this 8-week hypertrophy
  program, suggest a sensible rule for each strength slot." Powered by an
  Anthropic API call. Cool, but premature until adoption telemetry from §E
  proves coaches want help authoring rules rather than just having a
  shortcut for what they already type.

---

## 15. Recommended kickoff order (for tomorrow)

1. Skim the TL;DR + Decisions table to confirm nothing's drifted from chat.
2. Answer the 4 questions in §13 (deload preset naming, cool-off window,
   care-team email scope, conversion-time deload metadata).
3. Mark which suggestions in §14 you want folded in. Specifically A, B, D,
   F, G change the build slightly; C, E, H, I, J are post-MVP.
4. Greenlight Phase 0 — pure engine + unit tests. Zero risk to anything
   shipped; lands in a feature branch.
5. Phase-gate review at the end of each phase (you've used this model in
   prior PRs — it's worked well).

Tactical detail I'd flag: **Phase 6 has a DB migration**, which means it
needs to go through the same `supabase db push` / drift-check flow we
established in the pre-launch audit. Schedule it after a quiet day on the
production migration timeline.
