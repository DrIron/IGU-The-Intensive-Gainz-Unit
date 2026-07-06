-- UN1 — Usernames (cross-role display identity).
-- A user-chosen username on profiles_public becomes the sender identity across
-- roles. Cross-role reads go through a SECURITY DEFINER resolver so we never
-- loosen profiles_public row RLS. Format: ^[A-Za-z0-9_]{3,20}$, stored as entered
-- (case preserved for display) but unique case-insensitively; reserved blocklist;
-- no leading/trailing '_' and no '__' (enforced in the RPC, not the CHECK).

-- 1. Column + case-insensitive unique index + format backstop.
ALTER TABLE public.profiles_public ADD COLUMN username text;

CREATE UNIQUE INDEX idx_profiles_public_username_lower
  ON public.profiles_public (lower(username))
  WHERE username IS NOT NULL;

ALTER TABLE public.profiles_public
  ADD CONSTRAINT username_format
  CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_]{3,20}$');

-- 2. Single SQL source for the reserved blocklist (mirrored by a TS const on the
--    client). Used by set_username, is_username_available, and the backfill.
CREATE OR REPLACE FUNCTION public.username_is_reserved(p_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(p_username, ''))) = ANY (ARRAY[
    'admin','administrator','root','superuser','igu','official','staff','support',
    'help','system','api','mod','moderator','team','coach','dietitian','null',
    'undefined','me','you','everyone','here','deleted'
  ]);
$$;

-- 3. set_username — authoritative validation + own-row update.
CREATE OR REPLACE FUNCTION public.set_username(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_username, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_name !~ '^[A-Za-z0-9_]{3,20}$' THEN
    RAISE EXCEPTION 'Username must be 3-20 characters: letters, numbers, or underscore.';
  END IF;
  IF v_name ~ '^_' OR v_name ~ '_$' THEN
    RAISE EXCEPTION 'Username cannot start or end with an underscore.';
  END IF;
  IF position('__' in v_name) > 0 THEN
    RAISE EXCEPTION 'Username cannot contain two underscores in a row.';
  END IF;
  IF public.username_is_reserved(v_name) THEN
    RAISE EXCEPTION 'That username is reserved. Please pick another.';
  END IF;

  -- Case-insensitive uniqueness, excluding the caller's own current value.
  IF EXISTS (
    SELECT 1 FROM profiles_public
    WHERE lower(username) = lower(v_name) AND id <> v_uid
  ) THEN
    RAISE EXCEPTION 'That username is taken. Please pick another.';
  END IF;

  UPDATE profiles_public SET username = v_name WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'username', v_name);
END;
$$;

-- 4. is_username_available — boolean for the live account-settings hint. Invalid
--    or reserved values return false (nothing to check further).
CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text := trim(coalesce(p_username, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_name !~ '^[A-Za-z0-9_]{3,20}$'
     OR v_name ~ '^_' OR v_name ~ '_$'
     OR position('__' in v_name) > 0
     OR public.username_is_reserved(v_name) THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1 FROM profiles_public
    WHERE lower(username) = lower(v_name) AND id <> v_uid
  );
END;
$$;

-- 5. get_public_identities — cross-role public-safe identity resolver. SECURITY
--    DEFINER so a client can resolve a coach's handle without profiles_public
--    row RLS exposing first_name/status/etc.
CREATE OR REPLACE FUNCTION public.get_public_identities(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, username text, display_name text, avatar_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT pp.id, pp.username, pp.display_name, pp.avatar_url
  FROM profiles_public pp
  WHERE pp.id = ANY (coalesce(p_user_ids, ARRAY[]::uuid[]));
END;
$$;

-- 6. Backfill: every existing user gets a default handle so no one is "Someone".
--    slug(display_name -> first_name -> 'user'), lowercased [a-z0-9_], edge-rule
--    clean, min length 3, numeric suffix bumped until unique + not reserved.
--    Loop checks the live table so it can never produce a collision.
DO $$
DECLARE
  r RECORD;
  base_slug text;
  candidate text;
  n int;
BEGIN
  FOR r IN SELECT id, display_name, first_name FROM profiles_public WHERE username IS NULL LOOP
    base_slug := regexp_replace(
      lower(coalesce(NULLIF(trim(r.display_name), ''), NULLIF(trim(r.first_name), ''), 'user')),
      '[^a-z0-9_]', '', 'g');
    base_slug := regexp_replace(base_slug, '_+', '_', 'g');       -- collapse runs of _
    base_slug := regexp_replace(base_slug, '^_+|_+$', '', 'g');   -- strip leading/trailing _
    IF base_slug = '' THEN base_slug := 'user'; END IF;
    base_slug := left(base_slug, 16);
    base_slug := regexp_replace(base_slug, '_+$', '', 'g');       -- re-trim after truncation
    IF length(base_slug) < 3 THEN base_slug := rpad(base_slug, 3, 'x'); END IF;

    candidate := base_slug;
    n := 0;
    WHILE public.username_is_reserved(candidate)
          OR EXISTS (SELECT 1 FROM profiles_public WHERE lower(username) = lower(candidate)) LOOP
      n := n + 1;
      candidate := left(base_slug, 16 - length(n::text)) || n::text;
      candidate := regexp_replace(candidate, '^_+|_+$', '', 'g');
      IF length(candidate) < 3 THEN candidate := rpad(candidate, 3, 'x'); END IF;
    END LOOP;

    UPDATE profiles_public SET username = candidate WHERE id = r.id;
  END LOOP;
END $$;

-- 7. Grants: authenticated-only for all three RPCs (anon -> 42501 at the grant).
REVOKE ALL ON FUNCTION public.set_username(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_username(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_username(text) TO authenticated;

REVOKE ALL ON FUNCTION public.is_username_available(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_username_available(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_username_available(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_identities(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_identities(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_public_identities(uuid[]) TO authenticated;
