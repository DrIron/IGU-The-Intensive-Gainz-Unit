# Educational Content — Access, Discovery & Management Audit

**Date:** 2026-05-15
**Scope:** Mechanics only (access, search, filter, display, admin tooling). Content quality is out of scope.
**Surface area:**

- Client-facing browse: `src/pages/EducationalVideos.tsx` (route `/educational-videos`)
- Admin CRUD: `src/components/EducationalVideosManager.tsx` (mounted at `/admin/content-library?tab=education` via `src/components/admin/ContentLibraryPanel.tsx`)
- Playlists (client): `src/components/PlaylistViewer.tsx`
- Playlists (admin): `src/components/PlaylistManager.tsx`
- Coach onboarding videos: `src/pages/coach/CoachTrainingDashboard.tsx`, `src/components/admin/CoachEducationalContentManager.tsx`
- Secure player: `src/components/video/VideoAccessCard.tsx`, `src/components/video/SecureVideoPlayer.tsx`, `src/hooks/useVideoSignedUrl.ts`, `src/hooks/useVideoProgress.ts`
- Edge function: `supabase/functions/get-video-signed-url/index.ts`
- DB: `educational_videos`, `video_entitlements`, `video_progress`, `video_access_log`, `video_playlists`, `playlist_videos`, `coach_educational_content`, `coach_content_completions`

---

## 1. Architecture at a glance

There are **two parallel content systems** that share no plumbing:

| System | Tables | Audience | Entry point |
|---|---|---|---|
| **Client/coach videos** | `educational_videos` + `video_entitlements` + `video_progress` + `video_access_log` + `video_playlists` + `playlist_videos` | Members + staff browse | `/educational-videos` |
| **Coach training** | `coach_educational_content` + `coach_content_completions` | Coaches in training status | `/coach/dashboard` (auto-rendered when `coaches.status = 'training'`) |

The split is intentional (coach onboarding needs different completion semantics — auto-flips `coaches.status` to `active`), but the two systems have drifted in capability: the coach side has `duration_minutes`, `is_required`, `sort_order` and a completion gate; the client side has `is_pinned`, `is_free_preview`, `prerequisite_video_id`, entitlements and an access log. The same playback patterns are reimplemented in each.

Three different video display paths exist, and they are **not consistent**:

1. `EducationalVideos.tsx` → `VideoAccessCard` → `SecureVideoPlayer` → `get-video-signed-url` edge fn → logs to `video_access_log`, supports completion tracking
2. `PlaylistViewer.tsx` → raw `<iframe>` embedded directly from `educational_videos.video_url` — **bypasses** the edge function, **no access log**, **no completion tracking**
3. `CoachTrainingDashboard.tsx` → raw `<iframe>` embedded directly from `coach_educational_content.video_url` (acceptable here because RLS scope is staff-only)

---

## 2. Critical findings

### CRIT-1. `video_entitlements` is empty in production — all non-preview videos are unreachable

`supabase/migrations/20260126134814_*.sql:68-84` defines `user_has_video_entitlement(user_id, video_id)`:

```sql
SELECT EXISTS (
  SELECT 1 FROM subscriptions s
  JOIN video_entitlements ve ON ve.service_id = s.service_id
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'pending_payment')
    AND ve.video_id = p_video_id
)
```

`can_access_video` (`supabase/migrations/20260126134814_*.sql:111-132`) falls through to this check when the user is not admin/coach and the video isn't a free preview.

`grep -r "INSERT INTO video_entitlements"` and `"from('video_entitlements').*insert"` across the codebase returns **zero hits**. There is no admin UI to populate entitlements (the only video form in `EducationalVideosManager.tsx:121-128` writes `title, description, video_url, video_type, category, is_pinned`). The result is that **every active subscriber sees every non-free-preview video as "locked"** in `EducationalVideos.tsx:283-298` because the access state RPC returns `'locked'` (`supabase/migrations/20260126140353_*.sql:42-46`).

**Severity:** Launch blocker. The feature visible in the UI doesn't work for paying clients.

**Fix path** (pick one):
- (Simplest) Drop `video_entitlements` and gate by "user has any active subscription". Add an optional `educational_videos.required_service_ids UUID[]` column for fine-grained gating later.
- (Keep the model) Add a "Visibility" tab in `EducationalVideosManager.tsx` that lets admins assign each video to one or more services, with a "Visible to all subscribers" default that auto-inserts entitlements for every active service on save.
- (Stopgap migration) Seed `video_entitlements` from every `(active_video × active_service)` pair so the existing UI works, then layer a UI to scope back.

---

### CRIT-2. `PlaylistViewer` bypasses signed-URL flow, never logs access, breaks for storage videos

`src/components/PlaylistViewer.tsx:68-90` does a nested PostgREST FK join to read raw `video_url`:

```ts
.from("playlist_videos")
.select(`id, order_number, educational_videos (id, title, description, video_url, video_type, category)`)
```

Then renders the iframe directly at lines 183-192:

```tsx
const embedUrl = getEmbedUrl(video.video_url, video.video_type);
<iframe src={embedUrl} ... />
```

Consequences:
- **No row in `video_access_log`** for any playlist-driven view, even though the same user watching the same video via the main grid logs a row. Skews the audit trail and any future "popular videos" analytics.
- **No completion tracking.** Clients who consume content via Learning Paths get no progress credit. `useVideoProgress` is never invoked from this surface.
- **Storage-backed videos are silently broken.** Only `video_url` is read; if a video is in the bucket (`storage_path` set, `video_url` null), `getEmbedUrl` returns null at `PlaylistViewer.tsx:99` and the user gets the fallback "Watch Video" button which opens `video_url` (null) in a new tab.
- **Runtime crash risk.** `PlaylistViewer.tsx:156-157` destructures `pv.educational_videos` and reads `.video_url` without null-check. If RLS filters the inner join (client lacks entitlement, or video is inactive), the row arrives with `educational_videos = null` and the page crashes.

**Fix:** Replace the raw iframe with `<VideoAccessCard ...>` (same component used at `EducationalVideos.tsx:258-271`). Fetch `access_state` + `is_completed` per playlist video — either extend `get_educational_videos_with_access` to take an optional `playlist_id` filter, or add a sibling RPC `get_playlist_videos_with_access(p_playlist_id uuid)`.

---

### CRIT-3. Coaches are routed into the admin manager but lack write permissions

`src/pages/EducationalVideos.tsx:180-189` renders `EducationalVideosManager` for **anyone where `access.isStaff` is true** (`useClientAccess` line 197: `isAdmin || isCoach`). But RLS on `educational_videos` only grants INSERT/UPDATE/DELETE to admins (`supabase/migrations/20260126135619_*.sql:56-75`).

So a coach lands on `/educational-videos`, sees the full Add/Edit/Delete/Pin UI, clicks Add Video, fills the form, hits Submit, and `handleSubmit` at `EducationalVideosManager.tsx:131-152` issues `supabase.from('educational_videos').insert(...)`. CLAUDE.md flags this exact pattern: RLS denials on `.insert()` are returned as `{ error }`, not thrown. The manager does check `if (error) throw error` so the toast surfaces, but the UX is "click button, get red error" — not "you don't have permission for this".

**Fix:** Gate the manager by `access.isAdmin` only. Build a separate read-only `EducationalVideosCoachView` for coaches (same browse experience clients get, but without the "locked" badges since coaches have RLS access to all active videos). Optionally surface aggregate completion stats per video — coaches care about whether their clients watched the nutrition basics.

---

### CRIT-4. Direct writes to `educational_videos.video_url` enable cross-origin embed of any URL

`EducationalVideosManager.tsx:354-360` accepts any string for `video_url`. There is no URL validation, no allowlist of hosts, no XSS sanitization before passing it to `<iframe src={...}>` in `SecureVideoPlayer.tsx:256` and `PlaylistViewer.tsx:186`. An admin could paste a URL and it would be rendered as-is.

This is admin-only and admins are trusted, so it's not a privilege-escalation hole. But the audit trail is thin: an attacker who compromises an admin account can pivot to embedded malicious content reaching every active client. Also `getEmbedUrl` at `PlaylistViewer.tsx:92-100` and `SecureVideoPlayer.tsx:103-112` returns the raw `url` as-is if neither regex matches, which then goes straight into `iframe src`.

**Fix:** Validate `video_url` against a host allowlist on insert/update (Zod refine + edge function guard). Reject anything other than youtube.com, youtu.be, loom.com hosts. If you ever support self-hosted, require `storage_path` to be set and `video_url` to be null.

---

## 3. Access control matrix (current behavior)

| Surface | Admin | Coach | Active member | Past-due grace | Pending payment / pre-onboarding | Unauthenticated |
|---|---|---|---|---|---|---|
| `/educational-videos` route | ✓ | ✓ | ✓ | ✗ (page redirects) | ✗ | ✗ (AuthGuard) |
| See nav link (client sidebar) | n/a | n/a | ✓ | ✗ (`ClientSidebar.tsx:86-100` gates on status=='active') | ✗ | ✗ |
| RLS — read `educational_videos` | all rows | active rows only | active + entitled or free preview | active + entitled or free preview | same | none (anon revoked) |
| RLS — write `educational_videos` | ✓ | ✗ (silent fail when buttons clicked, see CRIT-3) | ✗ | ✗ | ✗ | ✗ |
| Manage playlists | ✓ | ✗ (admin-only RLS) | ✗ | ✗ | ✗ | ✗ |
| Mark complete | ✓ | ✓ | ✓ (if `can_access_video` true) | depends on grace logic | ✗ | ✗ |

**Inconsistencies:**
- `useClientAccess.canAccessContent` (line 244) is `true` during grace period, but `EducationalVideos.tsx:63` requires `hasActiveSubscription` (line 218: profile + sub both active). Grace-period users are redirected away despite the policy elsewhere allowing them to read. Pick one.
- `ClientSidebar.tsx:86-100` hides the nav for non-active clients, but the route is still reachable by typing `/educational-videos`. The redirect at `EducationalVideos.tsx:65-73` catches it, but only after the page mounts and runs four parallel Supabase queries. Move the gate into `OnboardingGuard` or a route-level role check.
- Free preview is rendered but the redirect-on-no-access blocks unauthenticated users from ever seeing them. The page is `<AuthGuard>`-wrapped at `src/App.tsx:280`. If marketing wants free previews to drive signup, they need a public surface or a public preview embed.

---

## 4. Code quality and pattern violations

Cross-referenced against CLAUDE.md "Common Patterns" and "Critical Warnings."

| # | File:line | Issue | CLAUDE.md rule |
|---|---|---|---|
| 4.1 | `PlaylistViewer.tsx:56-58` | No `hasFetched` ref guard; useEffect depends on `loadPlaylists` useCallback | Phase 16 fetch guard pattern (mandatory) |
| 4.2 | `EducationalVideosManager.tsx:85-87` | No `hasFetched` ref guard | Same |
| 4.3 | `PlaylistManager.tsx:53-56` | useEffect with empty deps + side-effect functions defined inline; no hasFetched | Same |
| 4.4 | `PlaylistViewer.tsx:68-90` | Nested PostgREST FK join `educational_videos(...)` on `playlist_videos` | CLAUDE.md bans nested joins on `client_programs/subscriptions/profiles` specifically — but the spirit (silent null on RLS filter) applies and is biting here. See CRIT-2. |
| 4.5 | `EducationalVideos.tsx:60-74` | Redirect logic inside useEffect with `hasRedirected.current = true` set after toast — toast may fire twice in StrictMode | Cosmetic |
| 4.6 | `PlaylistManager.tsx:11` vs `EducationalVideosManager.tsx:3` | `toast` from `sonner` vs `useToast` hook — two different toast libs in adjacent components | Code Style consistency |
| 4.7 | `EducationalVideos.tsx:31-42` and `EducationalVideosManager.tsx:32-42` | Duplicate `CATEGORIES` const | Extract to `src/lib/educationalContent.ts` |
| 4.8 | `PlaylistManager.tsx:168-180` | `Math.max(...playlistVideos.map(...))` from local state — race-unsafe with `UNIQUE(playlist_id, order_number)` | Compute server-side via RPC |
| 4.9 | `EducationalVideos.tsx:81` | `supabase.rpc(...)` not type-narrowed; `data as VideoWithAccess[]` cast at line 85 | TypeScript strict (CLAUDE.md "Code Style #1") |
| 4.10 | `useClientAccess.ts:117-172` | Runs 4 parallel queries on every mount of any page that uses it (`EducationalVideos.tsx:55`). No caching | React Query is the convention (CLAUDE.md "Common Patterns / React Query"); this hook bypasses it |
| 4.11 | `EducationalVideosManager.tsx` whole file | No i18n. Strings hardcoded English (`'Educational Videos'`, `'Manage educational video content for clients'`, all category names) | `nav.json` already exists; CLAUDE.md "i18n" section says new strings go through `react-i18next` |
| 4.12 | `EducationalVideos.tsx:31-42` | "All Categories" hardcoded as a CATEGORIES entry that's filtered with a `!==` string compare at line 101 instead of using null/sentinel value | Brittle |
| 4.13 | `PlaylistViewer.tsx:46-47` | `setSelectedPlaylist((current) => current ?? data[0].id)` — first playlist auto-selected, but if it has no active videos the user sees an empty state with no hint about other playlists | UX |
| 4.14 | `get-video-signed-url/index.ts` | No rate limit. Uses `_shared/rateLimit.ts` is available per CLAUDE.md but not applied | CLAUDE.md "Edge functions" |
| 4.15 | `get-video-signed-url/index.ts:14` | Doesn't handle the `req.json()` failure case explicitly; OPTIONS handled first which is correct | OK |
| 4.16 | `EducationalVideosManager.tsx:284-388` | `<Card onClick>` pattern not used — Dialog is the trigger here, so the rule doesn't apply. But the playlist cards at `PlaylistManager.tsx:252-385` aren't clickable themselves, fine. | n/a |
| 4.17 | `EducationalVideosManager.tsx:433-525` | Desktop `<Table>` only — no mobile-card fallback. The component is rendered inside `/admin/content-library` which mounts in `AdminPageLayout`, no `useIsMobile()` branch | CLAUDE.md "Mobile branching" |

---

## 5. UX inventory

### 5.1 Browse (`/educational-videos`, client view)

Strengths: clean Tabs split (All Videos / Learning Paths); featured-vs-regular section break on `is_pinned`; locked-state placeholder card with upgrade prompt; CMS-friendly empty state ("Educational videos are coming soon"); responsive grid (`md:grid-cols-2 lg:grid-cols-3`); category dropdown.

Gaps:

- **No durations.** `educational_videos` lacks `duration_seconds`. Clients can't tell which is a 2-minute primer vs. a 40-minute deep-dive.
- **No thumbnails.** Every card uses the same `<Video>` lucide glyph. YouTube oEmbed thumbnails are public and free.
- **No completion progress overview.** "X of N watched" badge or progress bar on the page header would surface the value users are getting.
- **No "Continue watching."** `video_progress.last_watched_at` is captured but never surfaced as a row.
- **No "New this week"** or "Recently added" automatic section. Pinning is the only curator lever and it requires manual admin work.
- **No prerequisite chain UI.** `prerequisite_video_id` exists and is checked in `can_access_video`, but if a video is locked because its prereq isn't done, the user sees the same "locked / requires subscription" copy — misleading.
- **Tab state not persisted** (`Tabs defaultValue="videos"`). Refresh always returns to Videos. Use URL search param.
- **Search/filter not persisted.** `searchQuery` and `selectedCategory` reset on remount. `localStorage('igu_eduvideos_filter')` would help.
- **No empty-state for "playlists exist but none visible to you".** PlaylistViewer renders "No learning paths available yet" only when admin has created zero. If admin has 3 playlists, all inactive, the user sees an empty button row with no message.

### 5.2 Manage (`/admin/content-library?tab=education`, admin view)

Strengths: bulk-select + bulk-delete (`EducationalVideosManager.tsx:406-432, 537-555`); per-row pin toggle + external link button; pin/active status badge column; deletion confirmation dialog mentions "All access rules and progress tracking will also be removed" (good — explicit about cascade).

Gaps:

- **No search/filter.** Loads every row, no input to narrow. Will be unusable at 50+ videos.
- **No pagination or virtualization.**
- **No entitlements UI.** See CRIT-1.
- **No `is_free_preview` toggle.** The form sets `is_pinned` but never `is_free_preview`. Column exists in the DB and is read by the access RPC; admin can't set it from the UI.
- **No `requires_completion` / `prerequisite_video_id` toggle.** Same — DB columns ignored by form.
- **No `is_active` toggle.** Soft-delete pattern is in the schema, but the UI only hard-deletes. Once you have 100+ historical videos some need to be hidden without losing watch history.
- **No reorder.** `order_index` column exists (`supabase/migrations/20260126134814_*.sql:9`) but unused in the UI; sort is always `is_pinned DESC, created_at DESC`.
- **No duplicate detection.** Two videos with the same `video_url` insert fine. Should warn.
- **No engagement metrics.** `video_access_log` and `video_progress` are admin-readable but no view aggregates them. Compare to `CoachEducationalContentManager.tsx:87-101` which already shows `completion_count` per content item.
- **Mobile unusable** — full-width table with 7 columns, no responsive collapse.

### 5.3 Playlists (admin)

Gaps:

- **No drag-and-drop.** `GripVertical` icon rendered at `PlaylistManager.tsx:306` is misleading — only manual order_number editing is theoretically possible but the UI doesn't expose it. The schema's `UNIQUE(playlist_id, order_number)` constraint blocks naive reordering anyway; needs a 2-pass or use a fractional-index approach (e.g. lexorank).
- **Add-video select doesn't refresh** after creating a new playlist (cached `videos` from initial load).
- **No bulk-add.** Adding 10 videos to a playlist is 10 separate selects + clicks.
- **No "duplicate playlist."**
- **No reorder of playlists themselves.** Sort is `created_at DESC` only.
- **Inline empty state** at line 302 only shows inside the "Manage Videos" dialog, not at the top-level "no playlists yet."

### 5.4 Playlists (client)

Already covered in CRIT-2. Additional gaps:

- Selected playlist not persisted across reloads (no URL param).
- No "next video" navigation between playlist items.
- No collapsible items — entire playlist is rendered as a long scroll of full-size video embeds. With 8 videos × ~720px each, this is a heavy initial paint.

### 5.5 Coach training (`/coach/dashboard` while in training status)

Strengths: clear required-vs-optional split, progress bar, acknowledgement checkbox + 80% time gate, completion auto-flips `coaches.status` via `check_training_completion` RPC.

Gaps:

- Time gate at `CoachTrainingDashboard.tsx:137-139` resets if the coach refreshes the page (state is in-memory only). Can be defeated trivially. If this is meant to be an integrity check, persist `view_started_at` server-side.
- No way for a coach to revisit a completed video except via the same card UI.
- No bookmarking / favoriting of optional content.

### 5.6 Coach training admin (`CoachEducationalContentManager.tsx`)

Strengths: shows completion counts per item; correct hasFetched guard; numeric sort_order field.

Gaps:

- `sort_order` is a free-form number input — two items with same value have undefined ordering. Use drag-and-drop or auto-renumber.
- No "preview as coach" mode.
- Deactivating an item leaves it visible in completion counts but the impact on `check_training_completion` (does it now require fewer items?) isn't surfaced. Suggest: warning modal when toggling `is_active = false` if any coach has the item incomplete.

---

## 6. Recommended additions and removals

Grouped by user value. Rough effort labels: S = single-file change, M = multi-file plus migration, L = new subsystem.

### 6.1 Highest-priority before launch

| # | What | Why | Effort |
|---|---|---|---|
| F1 | Unblock entitlements (CRIT-1 fix) | Without this, the feature doesn't work for paying clients | M |
| F2 | Replace `PlaylistViewer` raw iframe with `VideoAccessCard` (CRIT-2 fix) | Plug access-log + completion holes, fix storage videos | M |
| F3 | Gate admin manager to admins only; build read-only coach view (CRIT-3 fix) | Stop showing broken Add/Edit buttons to coaches | S |
| F4 | URL allowlist validation on `video_url` (CRIT-4 fix) | Defense in depth | S |
| F5 | Surface `is_free_preview` and `is_active` toggles in admin form | DB columns exist, just expose them | S |
| F6 | Add `duration_seconds INT` to `educational_videos` + show on cards | Already in coach training table; trivial schema bump | M |

### 6.2 New features (admin-side)

| # | What | Why | Effort |
|---|---|---|---|
| F7 | **Required viewing for clients/coaches** | Admin can mark videos as required for a role (or per service tier). Surface as a "You have N required videos" banner on the client dashboard with completion tracking. Mirrors the coach training pattern that already works | M |
| F8 | **Per-coach assigned content** | Coach can assign a video or playlist to a specific client. New tables `coach_content_assignments(coach_id, client_id, content_id, assigned_at, due_by)`. Coaches see their clients' completion status (RLS already permits via `is_primary_coach_for_user`) | L |
| F9 | **Search + filter + status filter in admin manager** | Same UI vocabulary as the client page (search input + category select + add "Status: active/inactive/pinned/free-preview") | S |
| F10 | **Drag-and-drop ordering** | Use `@hello-pangea/dnd` (already in stack). For playlists, switch `order_number` to a fractional/lexorank pattern so DnD is single-update, or write an RPC `reorder_playlist_videos(p_playlist_id, p_order uuid[])` that does the 2-pass safely | M |
| F11 | **Engagement dashboard** | Per-video views, unique viewers, completion rate, average days-to-watch. Aggregate from `video_access_log` and `video_progress`. Drop into `/admin/system-health` or new `/admin/content-engagement` | M |
| F12 | **Bulk operations expansion** | Bulk pin/unpin, bulk move to category, bulk add to playlist, bulk toggle active. Already have bulk-delete scaffold | S |
| F13 | **Duplicate detection** | Reject (or warn on) insert when `video_url` matches an existing row | S |
| F14 | **CSV import / API** | Bulk-onboard educational content from a spreadsheet | M |
| F15 | **Storage bucket janitor** | Admin page showing orphan video files (in bucket, no DB row) with a one-click cleanup | S |

### 6.3 New features (client-side)

| # | What | Why | Effort |
|---|---|---|---|
| F16 | **YouTube oEmbed thumbnails** | Free, public. Way better than a generic icon. Extract YouTube ID, request `https://i.ytimg.com/vi/<id>/hqdefault.jpg`. For Loom, use `https://cdn.loom.com/sessions/thumbnails/<id>-with-play.gif` (public) | S |
| F17 | **Continue watching row** | Read `video_progress` ordered by `last_watched_at DESC` where `completed_at IS NULL`, show top 4 | S |
| F18 | **Recently added row** | `created_at` desc, top 4. Optional admin-controlled "New" badge with a TTL | S |
| F19 | **Persist search / category filter** | `localStorage('igu_eduvideos_filter')` with structure `{ q, category, tab }` | S |
| F20 | **Prereq chain UI** | When a video is locked because of `prerequisite_video_id`, show "Complete X first" with a link instead of the generic upgrade copy | S |
| F21 | **Per-playlist progress bar** | `(watched / total) * 100%` shown on each playlist card. Also "Next up: ..." for in-progress playlists | M |
| F22 | **Coach badge on cards** | If a video is assigned by the user's coach (post F8), show a "From your coach" badge | S |
| F23 | **i18n** | Add `educational.json` namespace (en/ar). Currently page is hardcoded English, breaks Arabic users | M |
| F24 | **Mobile card view for admin manager** | Switch table → cards under `md:` breakpoint | S |

### 6.4 Things to consider removing

| # | What | Why |
|---|---|---|
| R1 | Free-form `sort_order` integer input in `CoachEducationalContentManager` | Drag-and-drop is more humane; reduce to a hidden field set by DnD |
| R2 | `GripVertical` icon at `PlaylistManager.tsx:306` | Misleading — implies DnD that doesn't exist. Either ship F10 or remove the icon |
| R3 | `EducationalVideosManager` rendered to coaches | Replace with read-only view (see CRIT-3) |
| R4 | Duplicate `CATEGORIES` const in two files | Extract to a shared module |
| R5 | Hardcoded `'youtube' \| 'loom'` `video_type` | If the URL allowlist (CRIT-4 fix) covers it, derive `video_type` from URL host automatically; drop the manual Select |

---

## 7. Schema/migration changes implied by recommendations

In dated migration order if you ship the full plan:

```sql
-- 1. Unblock entitlements (CRIT-1, F1) — choose ONE of:

-- 1A. Drop the entitlement model:
-- ALTER TABLE educational_videos ADD COLUMN required_service_ids UUID[] NULL;
-- DROP TABLE video_entitlements CASCADE;
-- Update can_access_video to: required_service_ids IS NULL OR EXISTS (...)

-- 1B. Seed entitlements for every active service:
-- INSERT INTO video_entitlements (video_id, service_id, tier)
-- SELECT ev.id, s.id, NULL FROM educational_videos ev CROSS JOIN services s WHERE ev.is_active;

-- 2. Duration (F6)
ALTER TABLE educational_videos ADD COLUMN duration_seconds INTEGER NULL CHECK (duration_seconds > 0);

-- 3. Required viewing for clients (F7)
ALTER TABLE educational_videos ADD COLUMN required_for_role TEXT NULL CHECK (required_for_role IN ('client', 'coach', 'all'));
-- Use video_progress for completion check.

-- 4. Coach content assignments (F8)
CREATE TABLE coach_content_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES educational_videos(id) ON DELETE CASCADE,
  playlist_id UUID REFERENCES video_playlists(id) ON DELETE CASCADE,
  due_by TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((video_id IS NULL) <> (playlist_id IS NULL))
);
-- RLS: coach reads/writes own; client reads own; admin all. Pattern from migrations 20260212170000 / 20260212180000.

-- 5. Playlist reordering safety (F10)
-- Drop UNIQUE(playlist_id, order_number) and add UNIQUE(playlist_id, video_id) only.
-- Move ordering to fractional or implement reorder via SECURITY DEFINER RPC.

-- 6. Sentinel "All" category — null instead of magic string
-- (no migration; cleanup in code only)
```

Per CLAUDE.md "WORKFLOW," each gets `YYYYMMDDHHMMSS_description.sql`, and any new RLS policy must come with the team-coach equivalent if coaches need access (CLAUDE.md "Team-based RLS").

---

## 8. Verification checklist before claiming any of this done

Per CLAUDE.md "After changes: don't claim 'done' without verifying."

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] `/educational-videos` renders for: admin, coach, active client with entitled videos, active client with NO entitled videos (should not show empty grid — see F18/empty state), grace-period client (decide intended behavior first)
- [ ] `/admin/content-library?tab=education` Add → Edit → Pin → Delete flow works end-to-end as admin; same flow as coach shows read-only view (after CRIT-3 fix)
- [ ] Playlist viewer plays a video AND logs to `video_access_log` AND advances `video_progress`
- [ ] Storage-backed video plays in both grid and playlist via signed URL (after CRIT-2 fix)
- [ ] Drift query: `SELECT id FROM educational_videos WHERE video_url IS NULL AND storage_path IS NULL` returns 0 (no orphans)
- [ ] `SELECT count(*) FROM video_entitlements` > 0 (after CRIT-1 fix)
- [ ] No `<Card onClick>` patterns introduced; all action cards use `ClickableCard`
- [ ] Mobile: `pb-24 md:pb-8` on every layout that hosts these pages — already satisfied since `EducationalVideos.tsx:151` and `:184` and `:195` use `py-24`

---

## 9. Suggested PR sequencing

1. **PR A (small, safety):** CRIT-4 URL allowlist + CRIT-3 admin-only gate on manager + remove misleading `GripVertical` from `PlaylistManager`.
2. **PR B (unblocks the feature):** CRIT-1 entitlements decision + admin UI for `is_free_preview` / `is_active`.
3. **PR C (consistency):** CRIT-2 — replace `PlaylistViewer` raw iframe with `VideoAccessCard`; add `get_playlist_videos_with_access` RPC.
4. **PR D (UX wins):** F16 thumbnails, F6 durations, F17 continue-watching, F19 filter persistence.
5. **PR E (admin power):** F9 admin search/filter, F11 engagement dashboard, F10 drag-and-drop, F12 bulk operations.
6. **PR F (new capability):** F7 required-viewing + F8 coach assignments.

PRs A–C should ship before any public launch announcement. PRs D–F are post-launch iteration.
