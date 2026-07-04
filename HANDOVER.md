# IGU — Session Handover (2026-07-04, written by outgoing Cowork/Fable session)

You are the Cowork half of a two-agent workflow. **Read this end-to-end, then `CLAUDE.md` (non-negotiable rules).** Your persistent memory (MEMORY.md + memory/ files) is current as of tonight — trust it; this doc is the narrative overlay.

## How we work (do not deviate)

- Terminal **Claude Code** BUILDS (owns git + `supabase db push` on Hasan's Mac). **You (Cowork)** VERIFY on prod (`execute_sql`, project `ghotrbotrywonaejlppg` — the ONLY project, "test" pushes ARE prod), drive browser smokes (Claude-in-Chrome; Hasan signs in, you drive), write specs. Hasan relays paste blocks between you and CC — write them paste-ready, no preamble.
- Preview-verify routing/architectural changes BEFORE merge; isolated/flag-gated changes may merge-then-smoke.
- **Deploy gotchas:** a merge can silently miss the Vercel prod webhook (preview builds, prod doesn't) — always compare the live bundle hash (`document.querySelectorAll('script[src]')`) against main HEAD before judging a deploy/soak; empty-commit re-triggers. Env-var changes need a cache-less rebuild. CDN briefly serves intermediate bundles.
- **DB test patterns:** jwt-claims impersonation `set_config('request.jwt.claims','{"sub":"<uid>"}',true)` passes `auth.uid()` gates (admin uid = `6a8272b5` admin@theigu.com — dr.ironofficial `92605b68` is coach-only!). Add `set_config('role','authenticated',true)` to test RLS as a user. Wrap in a DO block ending `RAISE EXCEPTION 'RESULT: %', payload` for guaranteed-rollback tests with readable output. Verify an RPC's own inserts in a separate statement (same-statement MVCC snapshot hides them).
- **Test accounts:** `dr.ironofficial+<tier>@gmail.com`. `+online` (`4331fa4f`) = primary fixture (assignment `74349417`, clone `093cee67`). **hasandashti.hd (`ce14d4f5`) is Hasan's REAL training account — never delete its logs.** B6 demo comment threads live on session `32dfcd7c` / checkin `da3903a1` / adjustment `29a015e4` — keep.

---

## TRACK 1 — P5 canonical unification (the priority burn-down)

**State: Drop Stage A LIVE + verified-in-soak (bundle `Cv_TjgEa`+, PR #187).** The app runs with NO legacy program read path. All writers canonical-primary. Everything this week is in memory (`project_igu_program_unification_build_plan`); short version:

- Write-side soak days 1–2 clean (`client_programs` flat at **8**, newest legacy row Jun 29). Daily monitor `igu-board-v2-soak-monitor` ~09:00 — its §3 source-paired parity query is the correct one (the runbook's 1c cross-joins and false-alarms on the +online fixture).
- **Before Stage B (the irreversible DROP), three gates:**
  1. **D3 slice** — `WorkoutSessionV2.tsx` ~1662–1699 legacy session loader: the LAST code that read+WRITES `client_module_exercise_id` (a Stage B column). Spec owed by you; own slice, not mechanical.
  2. **Re-key decision (Hasan's call):** 58/113 `exercise_set_logs` are legacy-keyed only — re-key into canonical or accept losing them with the tables.
  3. Clean Stage A soak (a few flat days; watch Sentry + the monitor).
- Then **Stage B** per `docs/P5_LEGACY_DROP_BUILD.md`: prod snapshot note → DROP `client_programs*`, `client_plan_overrides`, `save_client_plan_override`, `assign_team_program_atomic` → retire remaining flag refs. NEVER drop tables in the same PR that removed readers.
- Also owed: **D1** — canonical weekly-adherence read for `AdherenceSummaryCard` (frees the last pure-legacy Month/Week hooks). Independent of Stage B.

## TRACK 2 — Design backlog (Hasan's next arc; triage first)

`docs/IGU-Design-Changes-Master.xlsx` 'Design Changes' sheet (status col J) is the live board — **46 never-started rows + 4 spec-ready** (SE1 sessions-booking, WK10 coach-calendar, CARE1, PF1). Board hygiene: scan col A for the next free ID per prefix before appending; `cell.value=None` doesn't clear — assign `.value` explicitly.

Highlights Hasan explicitly cares about:
- **Card language site-wide** (partially shipped as CC1/CC2/CC5 + RD3 on coach surfaces): remaining = CC7 one-hero+ranked-stack everywhere, NU4 ribbon rings, NU5 graphs→metric-card stack, HX2 session recap card, CO4 capacity gauge, RO4 roster unification, CC6 skeletons, CC8 empty-states.
- **Public pages redesign**: PUB8 (align marketing visual language with the app — the big one) + PUB5/6/7/10. PUB1–4/9 shipped in June.
- **HX1 conflict (flagged on the board):** the shipped Estimated-1RM trend card contradicts Hasan's NO-e1RM decision — replace with actual logged rep-maxes (best load per rep count). Small slice.
- Recommended opener: a board **triage session** (mark rows superseded by June's redesign/Learn/WK12 work), then pick the arc — outgoing session recommends **public pages** (launch-facing, app design language now settled).

## Small open items (non-blocking)

B6 fast-follows (client-side session + adjustment threads — no host surface yet; unread badges/notifications) · WK2 rest-timer wall-clock anchor (real bug, P1, spec exists) · localStorage set-log draft + vaul onRelease bump (the ONE remaining unresolved Sentry issue, JAVASCRIPT-REACT-3 — everything else was triaged+resolved 2026-07-04) · saveProgress dirty-tracking · Overview card "4 days ago" vs subtitle "3d ago" rounding mismatch (cosmetic).

## This week's shipped record (for context, all verified)

T5 team backfill (Teams fully canonical) · client-logging PR1/2/2b/3 + PR2c (finish path closed after two REAL-workout-found bugs) · day-move slice (WK13 on the board) · B6 contextual comments (MS4 on the board; redesign doc B1→B6 CLOSED) · Drop Stage A (−1121 lines). Specs in `docs/`: T5_TEAM_BACKFILL_BUILD, DAY_MOVE_SLICE_BUILD, B6_CONTEXTUAL_COMMENTS_BUILD.

## Key references

`docs/P5_LEGACY_DROP_BUILD.md` (Stage B) · `docs/P5_FLIP_RUNBOOK.md` §1 (gate queries, with the 1c caveat) · `docs/PROGRAM_SYSTEM_UNIFICATION.md` (architecture) · `docs/COACH_CLIENT_REDESIGN.md` (closed, for context) · `CLAUDE.md` (rules — read first).
