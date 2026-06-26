# Activity → significant-PR matrix (B3 detector config)

Locked 2026-06-26. The single source for activity-aware PR detection. The A3 ship
(strength-only) lives inline in `src/pages/client/WorkoutSessionV2.tsx`
(`detectSetPr` / `classifySetPr`); **B3 should extract a shared engine** (suggested
`src/utils/prEngine.ts`) that consumes this matrix and is reused by the workout
summary, the Workouts pulse, and the "needs your eyes" flags.

## How detection works (all activities)

- A PR is judged **per exercise, vs the client's own prior history** for that movement
  (`exercise_set_logs` for all instances of the same `exercise_id`, excluding the
  current session) — same source as A3's `pr_refs`.
- **Routing:** a logged set is **strength** if `performed_load`/`performed_reps` are
  present; otherwise it's an **activity** and we read `performed_json`. The exercise's
  `exercise_library.category` (or session `activity_type`) selects which rule set applies.
- **warmup / cooldown / recovery → NO PRs** (supportive work; skip detection entirely).
- All loads canonical kg. `performed_pace` assumed **time-per-distance (lower = faster)**.

## Field reference

| metric | field | where | direction |
|---|---|---|---|
| load | `performed_load` | column | higher = better |
| reps | `performed_reps` | column | higher = better |
| rir | `performed_rir` | column | higher = easier |
| rpe | `performed_rpe` | column | lower = easier |
| time | `performed_json.performed_time` (sec) | json | context (lower=faster for fixed work; higher=longer for endurance/holds) |
| distance | `performed_json.performed_distance` (m) | json | higher = better |
| pace | `performed_json.performed_pace` (sec/unit) | json | lower = faster |
| rounds | `performed_json.performed_rounds` | json | higher = better |
| calories | `performed_json.performed_calories` | json | higher = better |
| hr | `performed_json.performed_hr` (bpm) | json | not a PR by itself (context) |
| side | `performed_json.performed_side` | json | grouping key only (L/R), not a PR |

## The matrix — one row per (activity, PR-type)

| # | Activity (category / ActivityType) | PR type | Metric → field | Condition (direction) | Significant threshold |
|---|---|---|---|---|---|
| S1 | Strength (`strength`) | Heaviest load | `performed_load` | load > best load ever (any reps) — higher | `> best` (loads discrete; any increase real) |
| S2 | Strength | Rep-range record | `performed_load` @ `performed_reps`±1 | load > best load ever at this rep-count ±1 — higher | `> best` in window |
| S3 | Strength | Got easier | `performed_rir` / `performed_rpe` at same `performed_load`×`performed_reps` | rir > prior best rir (or rpe < prior best rpe) at same load×reps — easier | rir Δ ≥ 1 · rpe Δ ≥ 0.5 |
| S4 | Strength (**NEW 4th**) | Rep PR at load | `performed_reps` @ same `performed_load` | reps > best reps ever at this exact load — higher | reps Δ ≥ 1 |
| C1 | Cardio (`cardio`) | Longest distance | `performed_distance` | distance > best distance ever — higher | ≥ 1% of best, min 50 m |
| C2 | Cardio | Longest duration | `performed_time` | time > best time ever — higher | ≥ 1% of best, min 30 s |
| C3 | Cardio | Fastest pace | `performed_pace` | pace < best (fastest) pace ever — lower | ≥ 1% faster |
| C4 | Cardio | Faster at a distance | `performed_time` @ same `performed_distance` bucket | time < best time at this distance bucket — lower | ≥ 1% faster, min 2 s |
| C5 | Cardio | New distance | `performed_distance` (bucketed) | distance bucket never logged before — novelty | bucket = round to 0.5 km (≥1 km → 1 km) |
| H1 | Conditioning/HIIT (`hiit`, or `sport_specific` w/ rounds) | Most rounds | `performed_rounds` | rounds > best ever — higher | rounds Δ ≥ 1 |
| H2 | Conditioning/HIIT | Fastest fixed workout | `performed_time` @ same `performed_rounds` | time < best at this round-count — lower | ≥ 1% faster, min 2 s |
| H3 | Conditioning/HIIT | Most reps in time cap | `performed_reps` @ same `performed_time` bucket | reps > best at this time cap — higher | reps Δ ≥ 1 |
| M1 | Mobility/Yoga (`mobility`, `yoga_mobility`) | Longest hold | `performed_time` (per `performed_side` if present) | time > best hold ever — higher | ≥ 1 s and ≥ 5% of best |
| M2 | Mobility/Yoga | Greater ROM/depth | — | **NO FIELD** — not detectable today | future: needs a `performed_rom`/depth metric |
| P1 | Physio/Rehab (`physio`) | Volume progression | `performed_reps` / `performed_rounds` | more reps/rounds than before — higher (progress-framed, low-key) | reps Δ ≥ 1 (label "Progress", not "PR") |
| W— | Warmup/Cooldown/Recovery (`warmup`,`cooldown`,`recovery`) | — | — | **No PRs** — skip | — |

## Strength confirmation

A3 shipped **3** types: **S1 heaviest load**, **S2 heaviest at reps ±1**, **S3 same load×reps at higher RIR / lower RPE**. The matrix **adds a 4th — S4: rep PR at a fixed load** (same weight, more reps — the growth form Hasan called out that A3 did not cover). S3 already covers both higher-RIR and lower-RPE.

## Significant thresholds (noise floor — tunable)

- **Strength:** loads/reps/rir are discrete → any strict improvement counts; only rpe needs a 0.5 step.
- **Cardio/HIIT distance & time:** `≥ 1%` of best with a small absolute floor (50 m / 30 s / 2 s) to dodge GPS/timer jitter.
- **Pace:** `≥ 1%` faster.
- **Mobility hold:** `≥ 1 s` AND `≥ 5%` (holds are short; relative floor avoids 1-second noise).
- **Novelty (C5):** bucket distances so 5.01 km ≠ a "new distance" vs 5.0 km.
- All thresholds belong in the engine config, not hard-coded per call.

## Detector config sketch (directly buildable)

```ts
type PrDirection = 'higher' | 'lower';
type PrCompare = 'best' | 'best_in_window' | 'best_at_key' | 'novelty';
interface PrRule {
  id: string;                       // 'S1'...'M1'
  categories: ExerciseCategory[];   // which exercise_library.category values
  metricField: string;              // 'performed_load' | 'performed_json.performed_distance' | ...
  direction: PrDirection;
  compare: PrCompare;
  keyBy?: string[];                 // S2: ['performed_reps±1']; S4: ['performed_load']; C4: ['distanceBucket']
  significant: { kind: 'gt' | 'abs' | 'pct' | 'step'; value: number; floorAbs?: number };
  label: string;                    // "Heaviest ever", "Faster at 5k", ...
  celebrate: boolean;               // physio P1 = false (label "Progress")
}
```

Build each row above into one `PrRule`. The engine: for a logged set, pick rules whose
`categories` include the exercise's category, resolve "best" from prior history (overall,
in-window, at-key, or novelty), apply `direction` + `significant`, and return the matched
PR types (+ the most impressive for the badge). Reuse for: per-set badge (logging),
summary achievements, and the pulse "needs your eyes" digest.
