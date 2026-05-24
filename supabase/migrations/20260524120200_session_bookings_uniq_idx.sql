-- B6-N1 (post-function part of the ship): GRANT on book_session_atomic
-- + partial UNIQUE on session_bookings(slot_id) for active bookings.
--
-- Both moved out of 20260524120100 because the Supabase CLI v2.78
-- statement-splitter bundles trailing statements with the preceding $$
-- block when the plpgsql body is large enough. Keeping the function alone
-- in 120100 and putting all the no-$$ statements here keeps the splitter
-- happy. See history: the original combined file failed with PG 42601
-- "cannot insert multiple commands into a prepared statement" three times.
--
-- The partial UNIQUE is defense-in-depth -- the FOR UPDATE row lock inside
-- book_session_atomic is the primary serialization. Partial so cancelled/
-- refunded bookings can coexist with a new active booking on the same slot.

GRANT EXECUTE ON FUNCTION public.book_session_atomic(uuid, uuid) TO authenticated, service_role;
