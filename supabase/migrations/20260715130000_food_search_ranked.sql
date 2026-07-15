-- Food search — ranked full-text (P0-ingest step 5).
--
-- The catalog jumped from ~47 hand-curated foods to ~8,200 USDA rows. `ilike('%q%')` was
-- instant at 47 and gives no relevance order at 8k: a search for "chicken" returned rows in
-- NAME order, so "Chicken, canned…" outranked "Chicken breast". This ranks by ts_rank over
-- the EXISTING `foods.search_tsv` GIN index (built at P0-lite; no new index).
--
-- Why a function and not a bare PostgREST .textSearch(): ranking needs ts_rank in the ORDER BY,
-- which PostgREST can't express. And `search_tsv` lives on `foods`, not on the `foods_search`
-- view. The function joins the two and returns the view's exact column shape, so the client maps
-- results unchanged.
--
-- RLS: SECURITY INVOKER (the default). It reads `foods_search` — which is security_invoker —
-- and `foods`, both under the CALLER's RLS. A client still sees approved global + their own
-- custom foods and nobody else's. It is NOT SECURITY DEFINER precisely so it cannot leak.
--
-- Fallback: full-text needs whole lexemes, so it misses short/partial tokens ("chi", "yog").
-- Below a 3-char threshold, or when the query yields no lexemes, it falls back to ilike so the
-- as-you-type picker still finds things on the first keystrokes. One function, one code path
-- for the client.

CREATE OR REPLACE FUNCTION public.search_foods(
  p_query    TEXT,
  p_category UUID DEFAULT NULL,
  p_limit    INT  DEFAULT 50
)
RETURNS TABLE (
  id                UUID,
  source            public.food_source,
  name              TEXT,
  brand             TEXT,
  owner_user_id     UUID,
  category_id       UUID,
  tags              TEXT[],
  serving_default_g NUMERIC,
  is_verified       BOOLEAN,
  kcal_100g         NUMERIC,
  protein_100g      NUMERIC,
  fat_100g          NUMERIC,
  carb_100g         NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_q     TEXT      := btrim(coalesce(p_query, ''));
  v_lim   INT       := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_tsq   tsquery;
  v_full  BOOLEAN;
BEGIN
  -- Full-text only when there's a query of >= 3 chars that actually produces lexemes.
  IF length(v_q) >= 3 THEN
    v_tsq := websearch_to_tsquery('simple', v_q);
    v_full := (v_tsq IS NOT NULL AND v_tsq <> ''::tsquery);
  ELSE
    v_full := false;
  END IF;

  RETURN QUERY
  SELECT fs.id, fs.source, fs.name, fs.brand, fs.owner_user_id, fs.category_id, fs.tags,
         fs.serving_default_g, fs.is_verified,
         fs.kcal_100g, fs.protein_100g, fs.fat_100g, fs.carb_100g
  FROM public.foods_search fs
  JOIN public.foods f ON f.id = fs.id
  WHERE (p_category IS NULL OR fs.category_id = p_category)
    AND (
      v_q = '' -- category-only browse: no name filter
      OR (v_full AND f.search_tsv @@ v_tsq)
      OR (NOT v_full AND fs.name ILIKE '%' || v_q || '%')
    )
  ORDER BY
    -- Ranked first when full-text; NULLS LAST so the browse/ilike paths fall through to name.
    CASE WHEN v_full THEN ts_rank(f.search_tsv, v_tsq) END DESC NULLS LAST,
    -- A prefix hit ("Chicken…") beats a mid-string hit under ilike/browse.
    CASE WHEN v_q <> '' AND fs.name ILIKE v_q || '%' THEN 0 ELSE 1 END,
    length(fs.name),
    fs.name
  LIMIT v_lim;
END;
$$;

-- Supabase grants EXECUTE to anon+authenticated by default; scope it to signed-in callers,
-- matching the authenticated-only RLS on the food tables (CLAUDE.md mandatory REVOKE pattern).
REVOKE ALL ON FUNCTION public.search_foods(TEXT, UUID, INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_foods(TEXT, UUID, INT) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_foods(TEXT, UUID, INT) TO authenticated;
