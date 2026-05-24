-- B5-N1 + B5-N8: enable realtime broadcast for coach<->client messaging.
-- Without these, src/components/messaging/CoachClientThread.tsx + the two
-- unread-count hooks subscribe to postgres_changes that never fire, so new
-- messages wait up to 5 min (fallback poll) before appearing.
--
-- REPLICA IDENTITY FULL is required for UPDATE events to ship the OLD row's
-- non-PK columns, which the realtime layer needs to evaluate the
-- `filter=client_id=eq.X` server-side filter on UPDATEs (in-place edits,
-- soft-deletes, read-receipt writes).

ALTER PUBLICATION supabase_realtime ADD TABLE public.coach_client_messages;
ALTER TABLE public.coach_client_messages REPLICA IDENTITY FULL;
