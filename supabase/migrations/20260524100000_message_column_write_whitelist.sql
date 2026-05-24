-- B5-N5 + B5-N9: pin immutable columns on coach_client_messages and
-- care_team_messages, and constrain read_by writes so the sender cannot
-- self-grant fake read receipts.
--
-- Background. ccm_update_own (RLS) allows the sender to UPDATE any column
-- on their own row. PostgreSQL's "updated row must remain visible under
-- SELECT" rule blocks the trivial case of a client moving their message
-- to a thread they have no relationship with, but a staff user serving
-- multiple clients can still move their own messages BETWEEN those
-- threads -- and the edit-history trigger doesn't fire because the message
-- text didn't change, so no audit trail. care_team_messages_team_update
-- has the same shape (USING-only, no explicit WITH CHECK, so the WITH
-- CHECK defaults to USING -- which still permits client_id changes within
-- the set of clients the staff user serves).
--
-- read_by tampering: the sender can directly UPDATE their own row's
-- read_by to a fabricated array, faking read receipts on outgoing
-- messages. The mark-read RPCs add only auth.uid(), so legitimate writes
-- are always a single self-addition; the trigger enforces that shape.

CREATE OR REPLACE FUNCTION public.enforce_coach_client_message_immutable_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_added uuid[];
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'coach_client_messages.client_id is immutable (B5-N5)';
  END IF;
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
    RAISE EXCEPTION 'coach_client_messages.sender_id is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'coach_client_messages.created_at is immutable';
  END IF;

  IF NEW.read_by IS DISTINCT FROM OLD.read_by THEN
    IF NOT (NEW.read_by @> OLD.read_by) THEN
      RAISE EXCEPTION 'coach_client_messages.read_by is append-only (B5-N9)';
    END IF;
    v_added := ARRAY(
      SELECT DISTINCT x FROM unnest(NEW.read_by) x
      WHERE NOT (x = ANY(OLD.read_by))
    );
    IF NOT (v_added <@ ARRAY[auth.uid()]) THEN
      RAISE EXCEPTION 'coach_client_messages.read_by additions restricted to caller (B5-N9)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS coach_client_messages_immutable_cols ON public.coach_client_messages;
CREATE TRIGGER coach_client_messages_immutable_cols
  BEFORE UPDATE ON public.coach_client_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_coach_client_message_immutable_cols();

-- ----------------------------------------------------------------------
-- Same hardening for care_team_messages.
-- ----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_care_team_message_immutable_cols()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_added uuid[];
BEGIN
  IF NEW.client_id IS DISTINCT FROM OLD.client_id THEN
    RAISE EXCEPTION 'care_team_messages.client_id is immutable';
  END IF;
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN
    RAISE EXCEPTION 'care_team_messages.sender_id is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'care_team_messages.created_at is immutable';
  END IF;

  IF NEW.read_by IS DISTINCT FROM OLD.read_by THEN
    IF NOT (NEW.read_by @> OLD.read_by) THEN
      RAISE EXCEPTION 'care_team_messages.read_by is append-only';
    END IF;
    v_added := ARRAY(
      SELECT DISTINCT x FROM unnest(NEW.read_by) x
      WHERE NOT (x = ANY(OLD.read_by))
    );
    IF NOT (v_added <@ ARRAY[auth.uid()]) THEN
      RAISE EXCEPTION 'care_team_messages.read_by additions restricted to caller';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS care_team_messages_immutable_cols ON public.care_team_messages;
CREATE TRIGGER care_team_messages_immutable_cols
  BEFORE UPDATE ON public.care_team_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_care_team_message_immutable_cols();
