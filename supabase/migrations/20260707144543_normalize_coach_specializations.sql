-- One-time data-only backfill: normalize free-text coaches_public.specializations
-- onto canonical specialization_tags.value (lowercase + underscore). Keeps only
-- values that resolve to an ACTIVE tag; aliases nutrition→nutrition_coaching,
-- strength→strength_training, mobility→mobility_flexibility. Drops (and logs)
-- anything that doesn't resolve. Idempotent (IS DISTINCT FROM guard). Coaches with
-- zero resolvable values are left untouched (nothing destroyed) — the dropped
-- values are logged for manual review; the coach re-picks in the tag picker.
DO $$
DECLARE r RECORD;
BEGIN
  -- Log values that won't resolve to an active tag.
  FOR r IN
    WITH tags AS (SELECT value FROM specialization_tags WHERE is_active),
    alias(raw, canon) AS (VALUES ('nutrition','nutrition_coaching'),('strength','strength_training'),('mobility','mobility_flexibility')),
    src AS (SELECT user_id, specializations FROM coaches_public WHERE specializations IS NOT NULL AND array_length(specializations,1) > 0),
    exploded AS (
      SELECT s.user_id, e.orig,
             regexp_replace(regexp_replace(lower(trim(e.orig)),'[^a-z0-9]+','_','g'),'^_+|_+$','','g') AS norm
      FROM src s, unnest(s.specializations) AS e(orig)
    )
    SELECT x.user_id, x.orig, COALESCE(a.canon, x.norm) AS canon
    FROM exploded x
    LEFT JOIN alias a ON a.raw = x.norm
    WHERE COALESCE(a.canon, x.norm) NOT IN (SELECT value FROM tags)
  LOOP
    RAISE NOTICE 'DROPPED coach % value "%" (no matching active tag)', r.user_id, r.orig;
  END LOOP;

  -- Apply: replace each coach's array with its distinct, valid, normalized values.
  -- Only touches coaches with >= 1 valid value (all-invalid coaches are left as-is).
  WITH tags AS (SELECT value FROM specialization_tags WHERE is_active),
  alias(raw, canon) AS (VALUES ('nutrition','nutrition_coaching'),('strength','strength_training'),('mobility','mobility_flexibility')),
  src AS (SELECT user_id, specializations FROM coaches_public WHERE specializations IS NOT NULL AND array_length(specializations,1) > 0),
  exploded AS (
    SELECT s.user_id, e.ord, e.orig,
           regexp_replace(regexp_replace(lower(trim(e.orig)),'[^a-z0-9]+','_','g'),'^_+|_+$','','g') AS norm
    FROM src s, unnest(s.specializations) WITH ORDINALITY AS e(orig, ord)
  ),
  resolved AS (
    SELECT x.user_id, x.ord, COALESCE(a.canon, x.norm) AS canon
    FROM exploded x
    LEFT JOIN alias a ON a.raw = x.norm
    WHERE COALESCE(a.canon, x.norm) IN (SELECT value FROM tags)
  ),
  final AS (
    SELECT user_id, array_agg(canon ORDER BY min_ord) AS new_specs
    FROM (SELECT user_id, canon, min(ord) AS min_ord FROM resolved GROUP BY user_id, canon) d
    GROUP BY user_id
  )
  UPDATE coaches_public cp
  SET specializations = f.new_specs
  FROM final f
  WHERE cp.user_id = f.user_id
    AND cp.specializations IS DISTINCT FROM f.new_specs;
END $$;
