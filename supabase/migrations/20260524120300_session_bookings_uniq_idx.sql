-- B6-N1 belt-and-braces: partial UNIQUE on session_bookings(slot_id) for
-- active bookings. The FOR UPDATE row lock inside book_session_atomic is the
-- primary serialization; this index is defense-in-depth so a future admin
-- tool or service-role write cannot create a second active booking on the
-- same slot. Partial so cancelled/refunded bookings can coexist with a new
-- active booking (legitimate re-book after cancel).
--
-- One-statement file because the CLI v2.78 splitter bundles multiple
-- non-$$ statements into one Parse, which PG rejects with 42601. See
-- 20260524120100 + 20260524120200 history for the full debug story.

CREATE UNIQUE INDEX IF NOT EXISTS uq_session_bookings_active_slot ON public.session_bookings (slot_id) WHERE status IN ('booked', 'completed');
