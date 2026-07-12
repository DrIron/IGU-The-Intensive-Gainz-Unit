# UN1 — Usernames (cross-role display identity)

**Status:** Build handoff (2026-07-05, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Board:** UN1 (Cross-cutting / Identity, P1 / M). Net-new. A user-chosen **username/handle** becomes the display identity shown across roles — starting with the coach↔client message thread (where a coach currently renders as **"Someone"**).

## Why / root cause (verified on prod)
Every user — clients AND coaches — has a `profiles_public` row (all 3 coaches are in it). The client sees "Someone" because **RLS on `profiles_public` blocks a client from reading a coach's row** (not missing data): `CoachClientThread.tsx` (~L138) resolves sender names via a direct `profiles_public.in(sender_ids)` query, which returns nothing for the coach. There is no shared, cross-role-readable handle today (only `display_name`/`nickname`, RLS-restricted).

## Design decision
- **Store `username` on `profiles_public`** (one row per user already; natural home beside `display_name`/`avatar_url`). Single unique index covers clients + coaches since all are in this table.
- **Resolve cross-role via a SECURITY DEFINER RPC** that returns ONLY public-safe identity fields for any user ids — no need to loosen `profiles_public` row RLS (which would over-expose `first_name`/`status`/etc.).
- **Username is the shown identity in messages** (Hasan: "name should be username"). The resolver also returns `display_name`/`avatar_url` so the UI can choose precedence later; Phase 1 shows the username (fall back to `display_name` then "Someone" only pre-backfill).

## Rules ("as expected of a username")
- **Format:** `^[a-zA-Z0-9_]{3,20}$` — letters, digits, underscore; length 3–20. No leading/trailing `_` and no consecutive `__` (enforce in validation). Stored as entered (preserve case for display) but **uniqueness is case-insensitive**.
- **Uniqueness:** `CREATE UNIQUE INDEX ... ON profiles_public (lower(username)) WHERE username IS NOT NULL;`
- **Reserved words (blocklist, case-insensitive):** admin, administrator, root, superuser, igu, official, staff, support, help, system, api, mod, moderator, team, coach, dietitian, null, undefined, me, you, everyone, here, deleted. (Keep the list in one place — a SQL array in the RPC + a mirrored TS const for client-side pre-check.)
- **Changeable** anytime (uniqueness re-checked). No change-rate limit in Phase 1 (note as a possible later guard).
- **Validation happens in BOTH** places: client Zod (instant feedback) + server RPC (authoritative — the client check is UX only).

## Data — migration `supabase/migrations/YYYYMMDDHHMMSS_usernames.sql`
1. `ALTER TABLE public.profiles_public ADD COLUMN username text;`
2. `CREATE UNIQUE INDEX idx_profiles_public_username_lower ON public.profiles_public (lower(username)) WHERE username IS NOT NULL;`
3. (Optional CHECK to backstop format at the DB: `ALTER TABLE ... ADD CONSTRAINT username_format CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_]{3,20}$');` — keep the reserved/`__`/edge rules in the RPC, not the constraint.)

### RPCs (all SECURITY DEFINER, SET search_path = public; REVOKE ALL FROM PUBLIC + anon, GRANT EXECUTE TO authenticated — verify anon → 42501)
- **`set_username(p_username text) RETURNS jsonb`** — auth.uid() null-guard; normalize/trim; validate format + no leading/trailing/`__` + not reserved (case-insensitive) → RAISE with a clear message per failure; check availability via `lower(username)` (excluding the caller's own current value) → RAISE `username taken` if collision; `UPDATE profiles_public SET username = p_username WHERE id = auth.uid()`; return `{ ok:true, username }`. (SECURITY DEFINER so the uniqueness check can see all rows without exposing them to the caller.)
- **`is_username_available(p_username text) RETURNS boolean`** — validates format + reserved (returns false for invalid/reserved) + no row with `lower(username)=lower(p_username)` other than the caller. Powers the live "✓ available / ✗ taken" hint. (Authenticated only.)
- **`get_public_identities(p_user_ids uuid[]) RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text)`** — returns public-safe identity for ANY ids from `profiles_public`. This is the cross-role resolver (replaces the direct `profiles_public` query in messaging). Grant authenticated. (Optionally grant anon too IF a public surface ever needs it — messaging is authenticated, so keep it authenticated-only for now.)

### Backfill (in the same migration, after the column exists)
Give every existing user a default so no one is "Someone" post-launch. Generate from `display_name` (else `first_name`, else `user`), slugified to `[a-z0-9_]`, truncated to ~16 chars, then a numeric suffix to guarantee uniqueness (loop or `... || row_number()`), all lowercased, min length 3 (pad). Set only where `username IS NULL`. Verify 0 nulls + 0 dup lower() after.

## Frontend
1. **Account settings** (`src/components/... AccountManagement` / the profile settings surface): add a **Username** field — controlled input, Zod schema mirroring the format + reserved rules, a debounced `is_username_available` check with inline ✓/✗ + reason, Save calls `set_username` (surface the RPC error via `toast`/inline). Show the current username. Reuse the codebase's form + toast conventions.
2. **Messaging sender resolution** (`src/components/messaging/CoachClientThread.tsx`): replace the direct `profiles_public.select(...).in("id", sender_ids)` (load ~L138 AND the realtime lazy-resolve ~L189) with `supabase.rpc("get_public_identities", { p_user_ids: sender_ids })`. Map `user_id → { username, display_name, avatar_url }`. Render the **username** as the sender label (fall back to `display_name` then "Someone"). This fixes the coach-"Someone" gap for the client. Keep the "You" treatment for own messages.
   - Also check the client-side unread/other message surfaces that render a sender name — reuse the same resolver rather than re-querying profiles_public.
3. **Types:** regenerate Supabase types for the new column + RPCs.

## Phase 2 (NOTE — not in this slice)
Roll the username out to the other cross-role surfaces (Care Team roster, coach cards, care-team messages author names, etc.) via the same `get_public_identities` resolver, and add an optional username step to onboarding. Do NOT build here — Phase 1 is the system + the messaging fix.

## Verify (Cowork, prod)
- **Set / rules:** a user sets a username in account settings; taken (case-insensitive) → rejected; reserved word → rejected; bad format/length → rejected; valid → saved. `is_username_available` inline hint matches. Server RPC rejects the same cases even if the client is bypassed (jwt-impersonation).
- **Uniqueness:** two users can't hold the same handle differing only by case (unique index on `lower(username)`).
- **Cross-role fix:** coach viewing client + client viewing coach both see the **username** as the sender in the thread — the coach no longer shows "Someone". jwt-impersonate the client → `get_public_identities([coach_id])` returns the coach's username (the thing `profiles_public` denied).
- **Backfill:** 0 users with NULL username, 0 case-insensitive dups.
- **Security:** anon → 42501 on `set_username` / `is_username_available` / `get_public_identities` (unless anon intentionally granted on the resolver).
- tsc (~306 baseline zero-new), ESLint 0, build clean.
