# B6 — Contextual comments (sessions · check-ins · adjustments)

**Status:** Spec (2026-07-02, Cowork). The LAST increment of `docs/COACH_CLIENT_REDESIGN.md` (line 64).
**What it is:** a short threaded note attached to a specific object — a logged session ("great pressing"), a weekly check-in, or a nutrition adjustment ("cut OHP volume") — living where that object renders. Distinct from the general `coach_client_messages` thread and from staff-only `care_team_messages`. Don't conflate the three.

---

## 1. Data model — one polymorphic table

```sql
contextual_comments (
  id          uuid PK DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL,            -- denormalized for single-hop RLS (plan_slots.plan_id trick)
  author_id   uuid NOT NULL,
  object_type text NOT NULL CHECK (object_type IN ('session','checkin','adjustment')),
  object_id   uuid NOT NULL,
  comment     text NOT NULL CHECK (char_length(comment) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now(),
  edited_at   timestamptz,
  deleted_at  timestamptz               -- soft delete, NO DELETE policy (coach_client_messages pattern)
)
-- INDEX (client_id, object_type, object_id, created_at)
```

**Object keys (canonical-only — no legacy `client_*` ids; the drop is imminent):**
- `session` → `plan_sessions.id` of the client's clone. Post-canonical there is no session-instance row (completion = logs, P4 deferred), but each clone plan_session occurs exactly once on that client's calendar, so it IS the dated instance. `SessionLogViewer.tsx:52` already holds `{assignmentId, planSessionId: module.id}` — the anchor exists.
- `checkin` → `adherence_logs.id` (the unified weekly check-in row).
- `adjustment` → `nutrition_adjustments.id`.

**Ownership integrity (polymorphic FK gap):** BEFORE INSERT trigger validates `object_id` belongs to `client_id` by `object_type` dispatch — schema verified on prod 2026-07-02:
- `session` → plan_sessions → plan_weeks → plan → client_plan_assignment.client_id (any status);
- `checkin` → `adherence_logs.user_id = client_id` (direct column);
- `adjustment` → **`nutrition_adjustments` has NO user_id** — resolve `nutrition_adjustments.phase_id → nutrition_phases.user_id = client_id`.
Per the trigger lesson: first branch `IF auth.uid() IS NULL THEN RETURN NEW;` so service_role/migrations aren't blocked.

## 2. RLS — mirror `coach_client_messages` exactly

- SELECT: `client_id = auth.uid()` OR `is_care_team_member_for_client(auth.uid(), client_id)` OR `is_primary_coach_for_user(auth.uid(), client_id)` OR `is_admin(auth.uid())`. Filter `deleted_at IS NULL` in app queries (keep rows readable for audit).
- INSERT: same actor set AND `author_id = auth.uid()`. Two-way by design — the client may reply on their own objects (it's a thread, not a broadcast).
- UPDATE: `author_id = auth.uid()` (edit own; soft-delete = UPDATE deleted_at). Admin may also soft-delete.
- No DELETE policy. No RPCs needed v1 — direct PostgREST with RLS. (Batch unread counts = deferred, see §5.)

## 3. UI — one shared component, three mounts

`src/components/comments/ContextualCommentThread.tsx` — props `{ clientUserId, objectType, objectId, canComment }`. Collapsed affordance: `💬 N` chip (or "Add note" when 0) → expands inline mini-thread (list + composer, Cmd/Ctrl+Enter, own-comment edit/delete kebab). Mobile: vaul Drawer per `useIsMobile()`. Plain `overflow-y-auto` (NOT Radix ScrollArea in a max-h chain — known footgun). `hasFetched` ref guard on the fetch.

Mount points (coach side / client side):
1. **Session** — `SessionLogViewer.tsx` footer (covers B5 calendar past-session viewer + WorkoutsTab drilldown, both roles reuse it); client's own completed-session recap surface if separate.
2. **Check-in** — coach `NutritionCheckInCard.tsx` (This-week tab); client `ClientNutritionProgress` weekly check-in card.
3. **Adjustment** — coach `NutritionAdjustmentWeekCard.tsx`; client-side wherever the applied adjustment renders (decision card history).

Gate composer on the same permission the surface already has (viewer identity comes from ClientContext on coach side; never refetch identity in the component).

## 4. Out of scope v1 (explicit)

Email notifications; unread badges/counts in nav (needs a batch RPC — do later if comments get traction); comments on legacy `client_*` objects; comments on plan TEMPLATE objects; reactions; attachments. NO flag needed — additive table + additive UI, invisible until someone comments.

## 5. Verify (Cowork, post-merge)

1. RLS matrix via jwt-claims rolled-back tests: client reads/writes own-object comment; coach (92605b68) reads/writes on +online's objects; anon 42501/empty; a NON-care-team coach gets nothing; ownership trigger rejects an object_id belonging to another client (mismatched client_id).
2. UI: coach comments on +online's Jun 30 logged session via SessionLogViewer → chip shows 1; client (+online session) sees it on the same session, replies; coach sees the reply. Same round-trip on this week's check-in (adherence_logs row exists from the Jun check-in) and on the week-4 approved adjustment.
3. Soak invariants unchanged (cp=8, overrides=0); no legacy writes.
4. tsc + build gates; migration REVOKE hygiene n/a (no new functions except the trigger — triggers need no grants).
