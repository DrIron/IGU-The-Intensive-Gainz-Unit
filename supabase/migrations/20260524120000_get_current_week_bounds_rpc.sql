-- B6-N8 (part 1 of 2): get_current_week_bounds RPC
--
-- Kuwait-anchored ISO week bounds. Week starts Monday 00:00 Asia/Kuwait
-- (UTC+3, no DST), ends Monday 00:00 the following week. PostgreSQL's
-- date_trunc('week', ...) uses ISO weeks (Monday start) which matches the
-- existing FE convention.
--
-- Closes B6-N8: the prior callsite at book-session/index.ts:179 referenced
-- this RPC but the function did not exist, so the edge fn fell through to a
-- UTC math path that wraps wrong on Kuwait Mondays (clients booking 00:00-
-- 03:00 KW Monday land in the prior UTC week, doubling weekly quota every
-- Monday morning).
--
-- Returns: { "week_start": timestamptz, "week_end": timestamptz }
-- Both values are timestamptz so callers can compare directly with
-- session_bookings.session_start (also timestamptz) without re-casting.
--
-- NOTE: This is part 1 of the book_session_atomic ship. Part 2 is in
-- 20260524120100_book_session_atomic_rpc.sql. Split into two files because
-- the Supabase CLI v2.78 statement-splitter mishandles multiple $$ blocks
-- in one file — the second $$; bundles trailing statements into a single
-- Parse and PG rejects with 42601. Two files = one $$ per file = safe.

CREATE OR REPLACE FUNCTION public.get_current_week_bounds()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH kw_now AS (
    SELECT (now() AT TIME ZONE 'Asia/Kuwait') AS local_now
  ),
  kw_monday AS (
    SELECT date_trunc('week', local_now) AS week_start_local
    FROM kw_now
  )
  SELECT jsonb_build_object(
    'week_start', (week_start_local AT TIME ZONE 'Asia/Kuwait'),
    'week_end',   ((week_start_local + interval '7 days') AT TIME ZONE 'Asia/Kuwait')
  )
  FROM kw_monday;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_week_bounds() TO authenticated, service_role;

COMMENT ON FUNCTION public.get_current_week_bounds() IS
  'Returns the current ISO week bounds anchored to Asia/Kuwait (UTC+3, no DST). '
  'Used by book_session_atomic to enforce weekly_session_limit. Closes B6-N8.';
