# Planning Board Weekly Deltas — Deploy Notes

> Quick deploy checklist for the changes in Phases 0-6. Most of this is
> standard `supabase db push` + edge-function deploy. The frontend changes
> ship via the normal Vercel push.

## Order of operations

1. **Smoke the frontend locally** (`npm run dev`) — confirm the Planning Board
   loads, the Add Week dropdown works, and the W1 slot popover surfaces the
   rule editor accordion. None of this touches the new table yet.

2. **Push the migration**:
   ```bash
   supabase db push
   ```
   Adds `deload_requests` + RLS + 3 helper RPCs + realtime publication.
   Migration is `supabase/migrations/20260603120000_deload_requests.sql`.

3. **Deploy the two edge functions** (no JWT — internal Authorization-header
   validation, follows the existing pattern; see `CLAUDE.md` JWT reference
   table for the rationale):
   ```bash
   supabase functions deploy send-deload-request-email --no-verify-jwt
   supabase functions deploy send-deload-response-email --no-verify-jwt
   ```

4. **Push the frontend** — normal `git push`, Vercel takes over.

5. **Verify end-to-end** with a test client account:
   - Client dashboard shows "Need a deload" button on the active program card.
   - Submitting from client side inserts a `deload_requests` row + fires the
     coach notification email.
   - Coach loads `/coach/clients/<test-client>?tab=overview` and sees the
     `DeloadRequestPanel` at the top of the Overview tab.
   - Approving / declining writes the response + fires the client email.

## Realtime gotcha

The migration adds `deload_requests` to `supabase_realtime` publication.
If your environment already has REPLICA IDENTITY restrictions on the table,
realtime subscriptions on UPDATE events may miss column-level changes —
verify in the Supabase dashboard under Database → Replication after the push.

## What's NOT in this PR (intentional follow-ups)

- **Auto-applying the deload to the client's running program on approve.**
  When the coach hits Approve, we record the response + email the client,
  but the actual deload reductions on `client_programs` / `client_day_modules`
  still need to be applied by the coach in the program editor. That requires
  understanding the client-program subsystem schema in more depth and was
  scoped out for this PR.
- **Mobile rule editor inside `MobileDayDetail`.** Coaches author rules on
  desktop; viewing on mobile works fine.

## Rollback

The migration is purely additive (new table + 3 new functions + 1 realtime
publication add). To roll back without dropping data, revert the frontend
deploy and leave the table in place — it's inert without UI calling into it.
A true drop migration:

```sql
DROP TABLE IF EXISTS public.deload_requests CASCADE;
DROP FUNCTION IF EXISTS public.get_pending_deload_request_for_client(UUID);
DROP FUNCTION IF EXISTS public.get_last_declined_deload_request_for_client(UUID);
DROP FUNCTION IF EXISTS public.get_coach_deload_request_counts();
ALTER PUBLICATION supabase_realtime DROP TABLE public.deload_requests;
```

## Smoke test queries

```sql
-- Insert a fake pending request as a client (run with that client's JWT
-- via the Supabase dashboard SQL editor under "auth.uid()" preview):
INSERT INTO deload_requests (client_id, subscription_id, client_message)
VALUES (auth.uid(), '<their-subscription-id>', 'sleep has been rough');

-- Verify the partial unique index forbids a second pending:
INSERT INTO deload_requests (client_id, subscription_id, client_message)
VALUES (auth.uid(), '<their-subscription-id>', 'another one');
-- Expected: ERROR  duplicate key value violates unique constraint
--           "deload_requests_one_pending_per_client"

-- Coach approves it:
UPDATE deload_requests
SET status = 'approved',
    coach_user_id = auth.uid(),
    coach_responded_at = now(),
    coach_response_message = 'Looks good -- W4 deload',
    approved_week_offset = 4,
    applied_preset_id = 'volume'
WHERE id = '<request-id>';
```

## CLAUDE.md updates

Both new edge functions were added to the JWT reference table in `CLAUDE.md`.
No other docs changed.
