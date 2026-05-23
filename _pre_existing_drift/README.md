# Pre-existing migration drift -- staged for separate cleanup

These are date-only-ID migrations that were already drifted (local-only,
never applied to remote) before today's Meet Our Team work. They surfaced
when `supabase db push` refused to apply `20260512120000_meetourteam_specialty_filter.sql`
on 2026-05-12 -- the CLI complained that these older local files would be
inserted before the latest remote-applied migration (`20260512100932`) and
required `--include-all` to proceed. Auditing 7 unrelated files was out of
scope for the Meet Our Team session, so they were staged here to allow a
narrow push. Cleanup is deferred.

For the wider drift-cleanup context (and the two other staged files from
today's session), see `../_pending_migrations/README.md`.

## What each file appears to do (by filename)

- `20260416_hip_flexor_execution_cues.sql` -- updates `movement_patterns.execution_points`
  for hip flexor movements.
- `20260419_forearms_upperback_execution.sql` -- updates `movement_patterns.execution_points`
  for forearms + upper back movements.
- `20260420_lower_traps_rhomboids_teres_execution.sql` -- updates `movement_patterns.execution_points`
  for lower traps / rhomboids / teres major movements.
- `20260421_core_execution.sql` -- updates `movement_patterns.execution_points`
  for core movements.
- `20260422_glutes_execution.sql` -- updates `movement_patterns.execution_points`
  for glute movements.
- `20260503_rest_seconds_max.sql` -- **schema change** involving rest values
  (likely adds or modifies `rest_seconds_max` column on some prescription table).
- `20260505_add_t_bar_row_mid_back.sql` -- inserts T-Bar Row exercise rows under
  mid-back subdivisions in `exercise_library`.

## Next session

Each of these needs to be reviewed against the **current remote schema**
before any decision (push, discard, or rewrite). Some are probably already
superseded by `supabase/migrations/20260512100817_exercise_library_v2_sync.sql`
(same drafts-applied-via-dashboard pattern as the two files in `_pending_migrations/`),
so cross-reference against that one first.

### Special care: `20260503_rest_seconds_max.sql`

This filename suggests a schema change involving rest values. CLAUDE.md has
a non-negotiable rule that rest values are always **seconds**, never minutes,
and column naming reflects that (`rest_seconds`, `rest_seconds_max`). Before
deciding whether to push, discard, or rewrite this file:

1. Read its actual SQL.
2. Diff against the current remote schema for the table it touches (probably
   `exercise_prescriptions` or `module_exercises`) -- check whether the
   target column already exists and whether its semantics match the
   seconds-only rule.
3. Only act once you've confirmed it doesn't reintroduce minutes or any
   units conversion.

The other 6 files are pure `UPDATE` / `INSERT` content edits and are lower
risk -- but still verify against remote before pushing anything.

## Why not delete

Deletion is reversible only via git, and these files were untracked. Keeping
them on disk preserves the option to recover original intent (whoever drafted
each file knew the muscle group being addressed, which is useful context if
remote turns out to be missing those cue updates).
