# Pending migrations -- do not push

Two local-only migration files were drafted but never pushed via CLI. The
equivalent SQL was instead applied to remote via the Supabase dashboard SQL
editor on 2026-05-12, landing as new migration history entries
`20260512100817` and `20260512100932`. These local files were staged here
on 2026-05-12 so `supabase db push` could not accidentally apply them again.

The dashboard-applied versions live at:

- `supabase/migrations/20260512100817_exercise_library_v2_sync.sql`
- `supabase/migrations/20260512100932_execution_cue_refinements.sql`

---

## `20260511000000_exercise_library_v2_sync.sql` -- superseded, discard

Byte-for-byte identical to `supabase/migrations/20260512100817_exercise_library_v2_sync.sql`.
The SQL is already applied to remote. **Do not push. Safe to delete after
confirmation.**

---

## `20260512000000_execution_cue_refinements.sql` -- one real delta vs remote

Near-identical to `supabase/migrations/20260512100932_execution_cue_refinements.sql`,
**except for Section 6 (Triceps Long Head)**. The remote version's Section 6
filter does not match any DB rows; the local version corrects this.

### The diff

**Local (`_pending_migrations/20260512000000_execution_cue_refinements.sql:69-83`)**
-- one combined UPDATE, filter matches the actual DB columns:

```sql
-- 6.1 Triceps Long Head -- both scapular-plane movements share identical cues
-- Note: muscle_group in DB is 'triceps' (not 'elbow_extensors')
UPDATE movement_patterns
SET execution_points = ARRAY[ ... ]
WHERE muscle_group = 'triceps'           -- line 78
  AND subdivision  = 'triceps_long'      -- line 79
  AND movement IN (
    'Overhead Extension (scapular plane)',
    'Extension with Shoulder Extension (scapular aligned)'
  );
```

**Remote (`supabase/migrations/20260512100932_execution_cue_refinements.sql:69-91`)**
-- two separate UPDATEs, filter does **not** match real DB column values:

```sql
-- First UPDATE, lines 69-79
WHERE muscle_group = 'elbow_extensors'              -- line 77
  AND subdivision  = 'elbow_extensors_triceps_long' -- line 78
  AND movement     = 'Overhead Extension (scapular plane)';

-- Second UPDATE, lines 81-91
WHERE muscle_group = 'elbow_extensors'              -- line 89
  AND subdivision  = 'elbow_extensors_triceps_long' -- line 90
  AND movement     = 'Extension with Shoulder Extension (scapular aligned)';
```

### Impact

The remote dashboard-applied version ran cleanly (no error) but updated
**zero rows** for Section 6 -- the two Triceps Long Head movements still
hold their pre-refinement `execution_points`. Every other section in the
remote version landed correctly because their filters do match the DB.

### Next-session decision

Two paths to resolve:

1. **Author a small targeted migration** that re-runs Section 6 with the
   correct `muscle_group = 'triceps'` / `subdivision = 'triceps_long'`
   filter. Then delete this file.
2. **Decide the remote enum naming is correct** (i.e. add or rename
   `movement_patterns` rows to use `elbow_extensors` / `elbow_extensors_triceps_long`).
   Then delete this file. This is a bigger refactor -- it would also
   require updating references elsewhere in the codebase and any seeded
   data.

Path 1 is the smaller, lower-risk fix. Path 2 only makes sense if the
naming convention is actively being changed elsewhere.

**Do not push this file as-is.** The local timestamp (`20260512000000`) is
earlier than the remote one (`20260512100932`), so a push would re-order
it before the remote version in the migration history -- a confusing audit
trail given the remote already applied.
