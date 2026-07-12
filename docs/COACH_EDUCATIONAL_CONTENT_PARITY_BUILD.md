# Coach educational content — full parity with the client learning system

**Status:** Build handoff (2026-07-04, Cowork). **Owner:** terminal. Cowork verifies on prod.
**Decision (Hasan, 2026-07-04): FULL parity** — mirror the client educational system for coaches, including learning-path playlists and an admin→coach assignment flow. Coach content stays **coach-only** (RLS: coaches + admins read; admin authors). Build in the 4 slices below (schema → viewing → admin authoring → assignment); each ships independently.

## The template (client system, for reference)
Tables `educational_videos` (+ `required_for_role` enum, `storage_bucket/storage_path`, `is_pinned`, `category`, `prerequisite_video_id`), `video_playlists` + `playlist_videos`, `video_progress`, `video_access_log`, `video_entitlements`, `coach_content_assignments`. Components `SecureVideoPlayer` (signed URL via edge fn `get-video-signed-url`), `VideoAccessCard`, `EducationalVideos.tsx` (7-tier discovery), `Learn.tsx`, `PlaylistViewer`, admin `EducationalVideosManager` + `PlaylistManager`. Discovery RPCs `get_educational_videos_with_access`, `get_required_content_summary`, etc.

## Current coach state (what exists)
Table `coach_educational_content` (title, description, video_url, external_url, cover_url, content_type[video/ebook/course/link], section[training/library/resources], category, level[intro/advanced], author, duration_minutes, **is_required** bool, sort_order, is_active). `coach_content_completions` (coach_user_id, content_id, completed_at, time_spent_seconds). UI: `CoachHub` (Training/Library/Resources tabs, raw `window.open` for Library/Resources), `CoachTrainingDashboard` (onboarding, auto-activates coach), admin `CoachEducationalContentManager` (basic CRUD). RLS (migration `20260625140000`): coaches+admins read `is_active`; admin writes. **Completion tracked only in Training.**

---

## Slice 1 — Schema alignment
Migration(s) `..._coach_content_parity_schema.sql`:
- `coach_educational_content`: add `required_for_role text CHECK (required_for_role IN ('coach','all') OR required_for_role IS NULL)` (mirrors the client enum; supersedes the binary `is_required` — backfill `is_required=true → required_for_role='coach'`, keep `is_required` through a soak then drop). Add `is_pinned boolean DEFAULT false` (featured tier), `storage_bucket text`, `storage_path text` (storage-backed videos), `prerequisite_content_id uuid REFERENCES coach_educational_content(id)` (optional gating, parity).
- New `coach_content_playlists (id uuid pk, title text, description text, is_active boolean DEFAULT true, sort_order int, created_at, updated_at)` + `coach_playlist_items (playlist_id uuid FK, content_id uuid FK, order_number int, PRIMARY KEY(playlist_id, content_id))`.
- New `coach_educational_assignments (id uuid pk, assigned_by uuid, coach_id uuid, content_id uuid NULL, playlist_id uuid NULL, note text, due_by date, assigned_at timestamptz DEFAULT now(), UNIQUE(coach_id, content_id), CHECK (content_id IS NOT NULL OR playlist_id IS NOT NULL))` — admin mandates content to specific coaches.
- New `coach_content_access_log (coach_user_id, content_id, accessed_at)` (parity audit; optional but in-scope for full parity).
- **RLS** (all new tables): read = `is_coach(auth.uid()) OR is_admin(auth.uid())` on active rows; content/playlist/assignment **writes = admin only**; `coach_content_completions` + `coach_educational_assignments` — a coach reads **own** rows (`coach_user_id/coach_id = auth.uid()`). Every SECURITY DEFINER helper/RPC gets the `REVOKE PUBLIC/anon; GRANT authenticated` treatment.
- Extend completion to **all sections**: no schema change needed (`coach_content_completions` is keyed by `content_id`) — just allow inserts from Library/Resources in the UI + confirm RLS lets a coach insert own completion for any active content.

## Slice 2 — Coach viewing parity
Mirror `EducationalVideos.tsx` for coaches (refactor `CoachHub` into a unified browse, or add `/coach/learn`):
- **Tiered discovery** (mirror the client 7-tier sort, coach-appropriate): **Required for you** (from `coach_educational_assignments` + `required_for_role IN ('coach','all')`) → **Continue** (in-progress from `coach_content_completions`/access log) → **Featured** (`is_pinned`) → **Recently added** (30d) → **by category/section**. Search + category + level + section filters (same UX as `/learn`).
- **Reuse `VideoAccessCard`** (add an `isCoachView` prop: show level/section badges instead of subscription/locked states) and **`SecureVideoPlayer`** — replace the raw `window.open`/modal-iframe. For storage-backed coach videos, extend the `get-video-signed-url` edge fn to resolve `coach_educational_content.storage_path` (add a `source: 'coach'` param + coach/admin auth check), or add a thin `get-coach-video-signed-url`. External URLs (ebooks/courses/links) still open out, but through a consistent card action.
- **Completion tracking across all sections**: mark-complete on Library/Resources cards (write `coach_content_completions`), page-header **progress bar** ("X of Y complete"), "Continue" row. Keep `CoachTrainingDashboard`'s auto-activate behavior for the Training section.
- **Playlists**: reuse `PlaylistViewer` bound to `coach_content_playlists`/`coach_playlist_items` (read-only, no assign button).
- **Required banner**: "You have N required items" via new RPC `get_coach_required_content_summary()` (mirror `get_required_content_summary`).

## Slice 3 — Admin authoring parity
`CoachEducationalContentManager.tsx` — bring to `EducationalVideosManager` parity:
- **Search + filters** (title/description/category, + section/level/status/required selects).
- **Bulk ops** (select → activate/deactivate/delete/set category/set level).
- **`required_for_role` select** + **pin toggle** + **storage upload** (mirror the avatar pattern `CoachProfile.tsx:149-173`; bucket e.g. `coach-content`).
- New **coach `PlaylistManager`** (copy admin `PlaylistManager`) for `coach_content_playlists` + `coach_playlist_items` (create playlist, add/remove/reorder items). Mount under the admin content-library area.

## Slice 4 — Admin → coach assignment
- New **`AssignToCoachDialog`** (mirror `AssignToClientDialog`): admin picks content/playlist + target coach(es) + optional note/due_by → inserts `coach_educational_assignments`. Entry point: an "Assign to coach" action in `CoachEducationalContentManager` + `PlaylistManager`.
- Coach side: assigned items surface in the **Required for you** tier + banner (Slice 2). RPC `get_coach_assignments_with_access()` (mirror `get_coach_assignment_progress`).
- Admin can see assignment completion (reuse the completion-count pattern already in the manager).

## Discovery RPCs (SECURITY DEFINER, REVOKE/GRANT authenticated)
`get_coach_content_with_access(p_coach_user_id)` (content + `is_completed` + access), `get_coach_required_content_summary()`, `get_coach_playlist_items_with_access(p_playlist_id)`, `get_coach_assignments_with_access()`. All gate to self/coach/admin; follow the exact-signature REVOKE/GRANT rule.

## Verify (Cowork, prod after merge, per slice)
- **S1**: new tables exist + RLS — a **client** (member) cannot read `coach_educational_content`/playlists/assignments (rolled-back jwt test as a member → 0 rows); coach + admin can; only admin can write.
- **S2**: coach `/coach/hub` (or `/coach/learn`) shows tiered discovery; a Library video opens in `SecureVideoPlayer` (signed URL, access logged), not a new tab; marking a Library item complete writes `coach_content_completions` + updates the header progress; playlists render via `PlaylistViewer`; required banner counts correctly.
- **S3**: admin can search/filter/bulk-edit coach content, set `required_for_role`, pin, upload a storage video (lands in the bucket, plays back); admin can build a coach playlist.
- **S4**: admin assigns content to a specific coach → that coach sees it under "Required for you" + banner; a different coach does not; completion reflects back to admin.
- Each slice: tsc/build clean, Sentry quiet; the `is_required → required_for_role` backfill verified before dropping `is_required`.

## Notes / coordination
- `CoachTrainingDashboard` (onboarding auto-activate) stays — it becomes the Training tier of the unified browse; don't regress the `check_training_completion` → `coaches.status='active'` path.
- Keep coach content **coach-only** throughout (never expose to clients) — the RLS leak fixed in `20260625140000` must not regress.
- Reuse client components (`VideoAccessCard`, `SecureVideoPlayer`, `PlaylistViewer`, `PlaylistManager`) with small view-mode props rather than forking — less drift.
- Docs: `docs/EDUCATIONAL_CONTENT_REVIEW.md` has the deeper client-system audit + open items (video_entitlements seed, URL allowlist) — out of scope here but relevant background.
