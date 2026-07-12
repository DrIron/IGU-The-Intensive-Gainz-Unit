# MS1 — Pinned messages on the coach↔client thread

**Status:** Build handoff (2026-07-05, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Board:** MS1 (Messaging, P1). Net-new. Coach/staff pins a key message (the current plan / a standing instruction) to the top of the `coach_client_messages` thread; the client sees it read-only.

## Model decision (flag if you disagree)
**Multiple pins** — each message is independently pinnable (`pinned_at` timestamp; NULL = unpinned). Pinned messages render in a "Pinned" section at the top, newest-pinned first. (If Hasan prefers a single pinned message where a new pin replaces the old, it's a one-line change — unpin others inside the RPC. Default = multiple.)
**Pinning is a STAFF action** (primary coach / care-team member / admin). The client can see pins but cannot pin/unpin.

## Data — `coach_client_messages` (id, client_id, sender_id, message, read_by, edited_at, deleted_at, created_at — verified; NO pin column yet)

### Migration `supabase/migrations/YYYYMMDDHHMMSS_coach_client_message_pins.sql`
1. `ALTER TABLE public.coach_client_messages ADD COLUMN pinned_at timestamptz, ADD COLUMN pinned_by uuid;` (plain uuid — do NOT FK to a coach/legacy table; the care-team FK-legacy landmine bit this area already. FK to `profiles_public(id)` is acceptable if you want referential integrity, but uuid-no-FK is fine since it's just an audit stamp.)
2. Partial index: `CREATE INDEX idx_ccm_pinned ON public.coach_client_messages (client_id, pinned_at DESC) WHERE pinned_at IS NOT NULL;`
3. RPC `set_coach_client_message_pinned(p_message_id uuid, p_pinned boolean) RETURNS jsonb`, `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`:
   - `IF auth.uid() IS NULL THEN RAISE EXCEPTION ...;`
   - Resolve `v_client_id` from the message (`SELECT client_id INTO v_client_id FROM coach_client_messages WHERE id = p_message_id AND deleted_at IS NULL;`); if not found, RAISE.
   - **Staff-only auth check (excludes the client):** allow only if `public.is_primary_coach_for_user(auth.uid(), v_client_id) OR public.is_care_team_member_for_client(auth.uid(), v_client_id) OR public.is_admin(auth.uid())`. A client (auth.uid() = client_id) satisfies none of these → denied. RAISE `insufficient_privilege` otherwise. (Pick the exact helper set to match the messaging write policy MINUS the client branch — confirm against the `coach_client_messages` UPDATE policy.)
   - `UPDATE coach_client_messages SET pinned_at = CASE WHEN p_pinned THEN now() ELSE NULL END, pinned_by = CASE WHEN p_pinned THEN auth.uid() ELSE NULL END WHERE id = p_message_id AND deleted_at IS NULL;`
   - `RETURN jsonb_build_object('message_id', p_message_id, 'pinned', p_pinned);`
   - **Mandatory grants:** `REVOKE ALL ON FUNCTION public.set_coach_client_message_pinned(uuid, boolean) FROM PUBLIC; REVOKE ALL ... FROM anon; GRANT EXECUTE ... TO authenticated;`
   - No email/notification (pinning isn't a new message).
   - Verify with `BEGIN; SET LOCAL ROLE anon; SELECT set_coach_client_message_pinned(...); ROLLBACK;` → must raise 42501.

## UI — `src/components/messaging/CoachClientThread.tsx`
- **Message interface (line ~49):** add `pinned_at: string | null; pinned_by: string | null;`. The fetches already `select("*")` (lines ~114, ~245) so the columns come through automatically — no select edit needed.
- **Wire `viewerIsClient`** (currently `_viewerIsClient`, line 92 — drop the underscore). `const isStaff = !viewerIsClient;`
- **Pinned section (new, above the scrollable message list):** render messages where `pinned_at && !deleted_at`, sorted by `pinned_at` desc, as compact pinned rows (a `Pin` lucide icon + sender name + truncated message + relative time). Staff rows get an "Unpin" control; the client sees them read-only. Render nothing when there are no pins. Tapping a pinned row MAY scroll to the source message (nice-to-have, optional).
- **Pin action on the kebab:** today the kebab (`MoreVertical`, line ~572) renders only for own messages with Edit/Delete. Change so the kebab renders when `(isOwn || isStaff)`; inside it show **Pin/Unpin** when `isStaff` (calls `supabase.rpc("set_coach_client_message_pinned", { p_message_id: msg.id, p_pinned: !msg.pinned_at })`, optimistic with rollback + `toast`), and keep **Edit/Delete** only when `isOwn` (unchanged). So a coach can pin the client's message too; the client keeps Edit/Delete on their own and gets no Pin.
- **Realtime:** the existing `.channel('ccm-thread:'+clientUserId)` `event:'*'` subscription (line ~171) already catches the pin UPDATE → apply it in place so the Pinned section updates live on both sides. Confirm the in-place UPDATE handler copies `pinned_at`/`pinned_by` (it maps the changed row — since it's `select('*')`-shaped, fields carry through).

## Verify (Cowork, prod, +online client + its coach)
- Coach pins a message → it appears in the Pinned section on BOTH the coach (MessagesTab) and client (`/messages`) views within a couple seconds (realtime); unpin removes it both sides.
- **Client cannot pin:** no Pin action in the client UI; and the RPC denies a client caller — jwt-impersonation as the client → `set_coach_client_message_pinned` raises insufficient_privilege.
- Anon denied on the RPC (42501).
- Pinning is a no-op on a soft-deleted message (WHERE deleted_at IS NULL).
- tsc (~306 baseline zero-new), ESLint 0, build clean.
