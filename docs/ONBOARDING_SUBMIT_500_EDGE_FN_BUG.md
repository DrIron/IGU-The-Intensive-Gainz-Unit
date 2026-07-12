# Onboarding submit still 500s — SECOND bug, edge-function runtime (P0 sync-trigger fix confirmed separate + working)

**Status:** Open. Found by Cowork 2026-07-08 during the Part C reactivation full-submit check. **Owner:** terminal CC (edge function). Cowork verified the entire DB layer is clean.

## TL;DR
The P0 `sync_form_submissions_safe` fix (7afc1ab) **works** — verified on prod. But `submit-onboarding` **still returns HTTP 500 on every POST** (reactivation path, +hybrid test account). Cowork reproduced **every DB operation the function performs** in isolation on prod and **they all succeed**. So the fault is in the **edge-function runtime**, not the database. CC needs to read the function's own console output (Supabase dashboard → Edge Functions → submit-onboarding → Logs) to see which `step` JSON logs before the 500, because the gateway logs only show the bare `POST | 500` line.

## Evidence gathered (all on prod, `ghotrbotrywonaejlppg`)

**Gateway logs (edge-function service):** 5 × `POST | 500` for `submit-onboarding`, ~1.8–2.7s each, deployment v19, between 14:45–15:00 UTC 2026-07-08. Each preceded by a clean `OPTIONS | 200`. One earlier `POST | 400` (Zod reject before I filled all fields).

**Postgres logs in that window:** no `form_submissions_safe` / 42P01 error anymore (P0 fix holds). The only P0-era errors are pre-fix (13:02, 13:22 `relation "form_submissions_safe" does not exist`) and my seed attempts. The post-fix smoke logged `SMOKE_OK ... safe_rows=1`.

**Isolated repros — each rolled back, each SUCCEEDS:**
1. `form_submissions` INSERT under the client's own RLS (jwt-claims impersonation, full valid payload incl. all NOT NULL enums `one_to_one_hybrid` / `instagram` / `intermediate_6_24` + all 5 agreement bools) → **OK, row inserted**, AFTER trigger fired clean.
2. `profiles_public` UPDATE `cancelled → pending_coach_approval` + `profiles_private` UPDATE under client RLS → **OK, 1 row**. No status-transition trigger blocks it.
3. `assign_coach_atomic(...)` for this user + `1:1 Hybrid` service (`82a7d8b3…`) → **OK**, returned `{coach_user_id, subscription_id, was_auto_assigned:true, needs_coach_assignment:false}`.
4. `assign_coach_atomic` ACL → `service_role=X/postgres` present. The edge fn's `supabaseServiceRole.rpc(...)` is grant-allowed.

**DB state after 5 failed POSTs:** zero net-new rows — `form_submissions` still had only the seeded row, `subscriptions` unchanged, no new coach rel. Consistent with the function 500ing without committing a `form_submissions` insert (each PostgREST call auto-commits independently, so a persisted insert would have survived a later-step failure — none did).

## Most probable causes (CC to confirm from the function logs)
Because the individual SQL ops all pass, the 500 is JS/runtime-level. Ranked:

1. **`...validatedData` spread into `insertPayload` (index.ts ~L298–336) carries a key that is not a `form_submissions` column** → PostgREST returns "Could not find the 'X' column … in the schema cache" → caught at L338 → generic 500 `"Failed to submit form"`, **no row persisted** (matches the observed DB state exactly). Schema/payload drift between the Zod schema (or the reactivation pre-fill `loadReactivationData`) and the table is the leading hypothesis. Cowork's repros used explicit column lists, so they would not hit this.
2. Uncaught exception somewhere after validation (email render/property access) — less likely given the try/catch wrapping, and it wouldn't match "no `form_submissions` row" unless it throws before L332.
3. Reactivation-specific payload field that new-client submits don't send.

## What CC should do
1. Open the **submit-onboarding function logs** and find the `console.error(JSON.stringify({... step ...}))` line emitted right before a 500 — that names the exact failing step. (The handled 500 branches each log a distinct `step`: `create_form_submission`, `update_profiles_public`, `create_medical_review`, `find_service`, `assign_coach_atomic`.) If none appears, it's an **uncaught** throw → check the outer catch / stack.
2. If `step: create_form_submission`: log the actual PostgREST error message (currently swallowed — the branch logs `error:"db_error"` only). Temporarily surface `submissionError.message`, reproduce, and you'll see the offending column/constraint. Fix = strip non-column keys from `insertPayload` (whitelist columns instead of blind `...validatedData` spread) **or** add the missing column.
3. **Improve the error contract while here:** the five 500 branches all return opaque bodies and log `error:"db_error"`. Include the real `.message` in the server log (not the client response) so the next incident is diagnosable from logs alone. This is why this took a full DB-layer sweep to localize.
4. This is **launch-critical** — it likely affects **new-client** submits too (not just reactivation), since the insert path is shared. Confirm with a new-account submit once the step is known.

## Also worth a quick look (separate, lower priority)
- **Team-card selection didn't register** in the onboarding UI (`TeamSelectionSection` ClickableCards — Fe Squad / Bunz of Steel — clicking didn't set `selected_team_id` or advance; plan ClickableCards DO select fine). Possible `TeamSelectionSection`-specific click handler / value-binding bug that would block the team onboarding path. Not yet root-caused.

## Cowork cleanup done
+hybrid test account (`9c547fb9-5b62-4cdb-88a7-34be9f35e79a`) restored to pre-test state: seeded `form_submissions` (3fd2d650) deleted (+ its `form_submissions_safe` row, via the fixed DELETE branch), `profiles_public.status='active'`, subscription `db43bf69` back to `active` via admin-override branch (override fields cleared). Waitlist confirmed still ON.
