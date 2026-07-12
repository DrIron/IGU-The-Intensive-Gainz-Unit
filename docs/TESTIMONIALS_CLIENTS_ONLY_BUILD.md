# Testimonials — gate submission to real clients only

**Status:** Build handoff (2026-07-04, Cowork). **Owner:** terminal. Cowork verifies on prod.
**Decision (Hasan, 2026-07-04):** a testimonial may be written **only by a client of the coach being reviewed** — someone who has (or had) a subscription with that coach. Any subscription status counts (active or past). No self-endorsement. Coaches/admins/non-clients cannot submit.

## The gap (verified on prod 2026-07-04)
- Route `/testimonial` (`src/App.tsx:271`) is wrapped in `WaitlistGuard` + `PublicLayout` only — **no auth/role gate**. The page checks `if (!user)` at submit but **not the role**.
- RLS INSERT policy `"Users can insert their own testimonials"` = `WITH CHECK (auth.uid() = user_id)` — **no role, no coach-relationship check**. So any authenticated user (coach, admin, a member with no coach) can INSERT.
- `coach_id` is taken from the `?coach=` URL param (`Testimonial.tsx:26-28`) with no validation → a coach can pass **their own id** and self-endorse; anyone can review a coach they never worked with.
- `author_display_name` falls back to `"Anonymous"` on profile-lookup failure (`Testimonial.tsx:124`).

What already works (leave alone): `is_approved` default false, admin-only moderation (`TestimonialsManager`, admin-gated), approved-only public display (`Index.tsx` + anon SELECT policy), `UNIQUE(user_id, coach_id)`, `author_display_name` snapshot.

## Server-side gate (authoritative — RLS + helper)

### Migration — `..._testimonials_clients_only.sql`
1. **Helper** (SECURITY DEFINER, `SET search_path = public`) — "is this user a client of this coach, ever":
```sql
CREATE OR REPLACE FUNCTION public.is_client_of_coach(p_client uuid, p_coach uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = p_client AND s.coach_id = p_coach   -- any status = active or past
  );
$$;
REVOKE ALL ON FUNCTION public.is_client_of_coach(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_client_of_coach(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_client_of_coach(uuid, uuid) TO authenticated;
```
   (SECURITY DEFINER so the check sees all of the caller's subscription rows without depending on subscriptions RLS inside a WITH CHECK. It's referenced by an INSERT WITH CHECK evaluated by `authenticated`, so grant `authenticated` — not a public/anon-readable policy, so no anon grant.)

2. **Replace the INSERT policy**:
```sql
DROP POLICY "Users can insert their own testimonials" ON public.testimonials;
CREATE POLICY "Clients can insert testimonials for their coach"
ON public.testimonials FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND coach_id IS NOT NULL
  AND auth.uid() <> coach_id                       -- no self-review
  AND public.has_role(auth.uid(), 'member')         -- must be a client (member role)
  AND public.is_client_of_coach(auth.uid(), coach_id)
);
```
   `member` is the client role (`app_role` enum; client = `member`). Coaches/admins lacking `member` fail here; a member with no subscription to that coach fails the relationship check.

### RLS verification (Cowork, rolled-back tx per coach)
Using jwt-claims impersonation (`set_config('request.jwt.claims', '{"sub":"<uid>","role":"authenticated"}', true)` + `set_config('role','authenticated',true)`), each in a `BEGIN … ROLLBACK`:
- **Client of coach X** inserting a testimonial for coach X → **succeeds**.
- Same client inserting for a **different** coach they never subscribed to → **42501 / 0 rows** (relationship fails).
- **Coach** (dr.ironofficial `92605b68`, not a `member`) inserting → **fails** (role + relationship).
- Client inserting with `coach_id = auth.uid()` (self-review) → **fails** (`auth.uid() <> coach_id`).
- `anon` insert → **fails** (policy is `TO authenticated`).

## Frontend gate (UX + defense-in-depth) — `src/pages/Testimonial.tsx` + `src/App.tsx`
1. **Route**: wrap `/testimonial` in `AuthGuard` (keep `WaitlistGuard`/`PublicLayout`). Non-authed → `/auth` at the route level, not just at submit.
2. **Client-only + coach resolution**: on mount, resolve the submitter's coaching relationship from **their own subscription** (`subscriptions.coach_id` for `user_id = auth.uid()`), NOT from the `?coach=` URL param. 
   - If the user has no coach relationship (not a client) → render a friendly "Only IGU clients can leave a testimonial" state, no form.
   - If they have exactly one coach → that's `coach_id` (form shows "Reviewing <coach name>").
   - If multiple (rare) → let them pick from *their own* coaches only.
   - **Stop trusting `?coach=`** — at most use it to preselect among the user's real coaches; never as the written value. This kills the self-endorsement + arbitrary-coach vectors even before RLS.
3. **Drop the `"Anonymous"` fallback** (`Testimonial.tsx:124`) — require the resolved `author_display_name` from `profiles_public`; if it can't resolve, block submit with an error rather than writing "Anonymous".
4. Keep the existing `UNIQUE(user_id, coach_id)` handling (already-submitted → friendly "you've already reviewed this coach").

## Verify (Cowork, prod after merge)
- RLS tests above all pass.
- Signed in as a **client** (a `dr.ironofficial+<tier>` test account with a coach) → `/testimonial` shows the form pre-bound to their real coach; submit writes a row (`is_approved=false`, correct `coach_id`, real `author_display_name`).
- Signed in as **coach** (dr.ironofficial) → `/testimonial` shows the "clients only" state, no form; a forged direct insert is rejected by RLS.
- `?coach=<arbitrary id>` in the URL does **not** change the written `coach_id` (stays the submitter's real coach).
- Admin moderation + approved-only public display still work (unchanged).
- tsc/build clean.

## Notes
- Past/churned clients CAN still testimonial (any subscription status) — per the decision. If a coach relationship is later fully deleted (no subscription row at all), they lose the ability; acceptable.
- `TestimonialsManager` and the public display are untouched.
