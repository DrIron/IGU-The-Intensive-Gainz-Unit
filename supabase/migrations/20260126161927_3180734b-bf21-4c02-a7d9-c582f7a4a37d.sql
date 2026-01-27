-- Move pgcrypto to extensions schema (drop from public, create in extensions)
DROP EXTENSION IF EXISTS pgcrypto CASCADE;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Recreate the hash function to use extensions schema
CREATE OR REPLACE FUNCTION public.discount_code_hash(p_code text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions
AS $$
  SELECT encode(extensions.digest(upper(trim(p_code)), 'sha256'), 'hex')
$$;