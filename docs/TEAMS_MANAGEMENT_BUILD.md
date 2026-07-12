# Teams — head-coach management completeness

**Status:** Build handoff (2026-07-04, Cowork). **Owner:** terminal. Cowork verifies on prod.
**Context (confirmed on prod):** teams are created + run by **head coaches**; **admin is read-only by design** (RLS `coach_teams_admin_all` is USING-only, no write exemption). Core flow works (create → assign program → client joins). This slice fills the four **management gaps** Hasan chose: (1) edit team, (2) member removal, (3) cover-image upload, (4) deactivate + waitlist management. All head-coach-scoped; no admin appearance control added.

RLS already in place (migration `20260212140000`): `coach_teams` INSERT requires `is_head_coach AND auth.uid()=coach_id`; UPDATE + DELETE require `auth.uid()=coach_id`. So edit/deactivate need **no new table policy** — just UI + (for member removal) an atomic RPC.

---

## 1. Edit team (wire the already-built dialog)
`CreateTeamDialog` already supports edit: `editTeam` prop hydrates name/description/tags/max_members and the UPDATE branch exists (`CreateTeamDialog.tsx:26,43,55-68,109`). It's just not reachable from the detail page.
- **`TeamDetailShell.tsx`**: add a header **kebab/menu** (or "Manage team" button), visible only to the team's head coach (`context.coachUserId === auth.uid()`), with **Edit team**. Opens `CreateTeamDialog` with `editTeam={{ id, name, description, tags, max_members }}` from the resolved `coach_teams` row; on success, refetch the team context.
- No schema/RLS change (UPDATE policy already allows `auth.uid()=coach_id`).

## 2. Member removal / kick
No UI today; `subscriptions.team_id`+`coach_id` are set atomically by `join_team`. Removal must be equally atomic.
- **Migration** `..._remove_team_member_rpc.sql` — `remove_team_member(p_subscription_id uuid, p_team_id uuid)` SECURITY DEFINER, `SET search_path = public`:
  - Auth gate: caller is the team's head coach (`auth.uid() = (SELECT coach_id FROM coach_teams WHERE id = p_team_id)`) **OR** `is_admin(auth.uid())`.
  - Lock the subscription row `FOR UPDATE`; verify `subscriptions.team_id = p_team_id` (else no-op/raise).
  - Unset `team_id = NULL`. **Coach binding decision (Hasan — flag in PR):** default = also clear `coach_id = NULL` (the member becomes unassigned; team WAS their coaching relationship in the team-plan tier). Keep `status` untouched (they still hold their subscription). Do NOT delete the subscription.
  - `REVOKE ALL … FROM PUBLIC; REVOKE … FROM anon; GRANT EXECUTE … TO authenticated;` (per the RPC pattern).
- **`TeamRosterTab`** (`.../detail/tabs/TeamRosterTab.tsx`): add a per-member **Remove** action (head coach only) → confirm dialog ("Remove <name> from <team>? They'll keep their subscription but lose the team + coach assignment.") → call RPC → refetch roster + member count. Destructure `{ error }` and throw.

## 3. Cover image upload
`coach_teams.cover_image_url` exists and `TeamBrowserCard` already renders it — there's just no upload path.
- Add a **cover image** field to the edit flow (in `CreateTeamDialog` edit mode, or the manage menu). Mirror the proven avatar pattern (`CoachProfile.tsx:149-173`):
  - `supabase.storage.from('team-covers').upload(\`${teamId}/cover.${ext}\`, file, { upsert: true })` → `getPublicUrl` → `update coach_teams.set({ cover_image_url }).eq('id', teamId)` (destructure `{ error }`, throw).
- **Migration/config** `..._team_covers_bucket.sql` (or Studio): create public bucket **`team-covers`**; storage RLS — INSERT/UPDATE allowed when the object's top folder = a team the caller head-coaches (`(storage.foldername(name))[1]` ∈ the caller's `coach_teams.id::text where coach_id = auth.uid()`); public read. (Mirror how `coach-profiles` bucket is scoped.)
- Show current cover + replace/remove in the edit UI. Validate type (image/*) + size (e.g. ≤ 2MB) client-side.

## 4. Deactivate + waitlist management
### Deactivate (soft-delete)
- Manage menu → **Deactivate team** (head coach), confirm dialog → `update coach_teams.set({ is_active: false }).eq('id', teamId)` (RLS UPDATE already allows). Deactivated teams already drop from the public browser + onboarding (`list_public_teams_for_browser` / `list_active_teams_for_client` filter `is_active`) and from the coach list. **Member bindings are left intact** (reversible) — reactivating restores visibility. Show deactivated teams in the coach's own `CoachTeamsPage` list with an "Inactive" badge + **Reactivate** action (so a soft-deleted team isn't stranded).
- Note: this does NOT unassign members or cancel subscriptions — deactivation only hides the team. If Hasan later wants "disband" (unbind all members), that's a separate destructive action.

### Waitlist management
`team_waitlist(team_id, email, user_id, status, created_at, notified_at)` captures signups for full teams (anon INSERT allowed) but there's no read/notify surface.
- **RLS**: add a SELECT policy on `team_waitlist` for the team's head coach (`team_id IN (SELECT id FROM coach_teams WHERE coach_id = auth.uid())`) + admin. (Anon INSERT stays.)
- **UI**: a **Waitlist** section/tab in `TeamDetailShell` (head coach only) listing entries (email / name if `user_id` resolves / joined date / status). Action **Notify** when a spot opens → set `notified_at = now()`, `status = 'notified'`, and send the invite email via the existing email system (reuse the `send-waitlist-*` edge-fn pattern; `@mail.theigu.com`, `--` not `—`). MVP: view + mark-notified (+ email). Full auto-promotion on a freed spot is out of scope.

---

## Verify (Cowork, prod after merge)
- **Edit**: head coach opens Manage → Edit, changes name/tags/max_members → persists; a non-owner coach sees no manage menu; RLS blocks a forged UPDATE by a non-owner (rolled-back jwt test).
- **Remove**: `remove_team_member` — owner head coach removes a member → `team_id` (and `coach_id`) cleared, subscription/status intact, member count decrements; non-owner/anon → `42501`; admin allowed.
- **Cover**: upload as head coach → object lands under `team-covers/<teamId>/`, `cover_image_url` set, renders on `TeamBrowserCard`; a head coach can't write to another team's folder (storage RLS).
- **Deactivate**: `is_active=false` → team gone from `/teams` + onboarding; shows "Inactive" + Reactivate in the coach's list; reactivate restores it.
- **Waitlist**: head coach sees their team's waitlist; Notify marks `notified_at` + sends one email; a different coach can't read this team's waitlist (RLS).
- tsc/build clean; Sentry quiet.

## Out of scope
Admin team controls (intentionally none). Program-change history/audit. Bulk roster ops. Auto-promotion from waitlist. "Disband team" (destructive member unbind). These can be follow-ups.
