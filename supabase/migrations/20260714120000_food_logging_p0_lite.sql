-- ============================================================================
-- Food Logging — P0-lite: data foundation for the client food log (P1).
--
-- Scope (agreed 2026-07-14): the MINIMUM schema P1 needs, with column shapes kept
-- FAITHFUL to docs/FOOD_LOGGING_PLAN.md §4.1 / §4.1b / §4.2 / §4.3 so the deferred
-- work drops onto this UNCHANGED:
--
--   * P0-ingest (deferred, NAMED — not dropped): USDA Foundation + SR Legacy bulk
--     ingest with category auto-assign, and the `fdc-food-search` edge fn with
--     branded cache-on-use. Everything it needs is here: `source` carries all the
--     USDA/partner values, `fdc_id`, `upc`, `cached_at`, `search_tsv` + its GIN
--     index, `approval_status`/`approved_by`/`approved_at`, and the normalized
--     `food_nutrients` table. Ingest is an INSERT job, not a schema change.
--   * P4 (role-layered read): `nutrients.coach_visible` is here and is FALSE for
--     every micro, so `get_client_daily_nutrition` can shape a macro-only payload
--     for coaches without touching this schema.
--
-- Deliberately NOT here (both are additive, non-breaking later migrations):
--   * `restaurants` + `foods.restaurant_id` — P3b. The `'partner'` source value IS
--     seeded into the enum, because extending an enum later is the awkward part;
--     adding a nullable FK column is not.
--   * `recipes` / `recipe_ingredients` — P2. The `'recipe'` source value is likewise
--     already in the enum.
--
-- Micronutrients: the `nutrients` / `food_nutrients` tables are the real normalized
-- model (per the plan's recommendation over a JSONB column), and `food_log_entries`
-- carries a `micros` JSONB SNAPSHOT so the diary stays an immutable historical record
-- even when a food row is later re-pulled or corrected.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.food_source AS ENUM (
    'usda_foundation', 'usda_sr', 'usda_branded', 'partner', 'igu_staff', 'custom', 'recipe'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_approval_status AS ENUM ('approved', 'pending', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_unit_kind AS ENUM ('mass', 'volume', 'serving');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.food_log_unit AS ENUM ('g', 'kg', 'ml', 'l', 'serving');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.nutrient_category AS ENUM ('macro', 'micro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- §4.1b — Food taxonomy (2 levels, admin-editable; same pattern as the exercise library)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  parent_id  UUID REFERENCES public.food_categories(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  icon       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, name)
);
CREATE INDEX IF NOT EXISTS idx_food_categories_parent ON public.food_categories(parent_id, sort_order);

-- ---------------------------------------------------------------------------
-- §4.1 — Nutrient reference. `coach_visible` drives the P4 role-layered read.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nutrients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key                 TEXT NOT NULL UNIQUE,          -- stable programmatic handle ('protein', 'sodium')
  name                TEXT NOT NULL,
  unit                TEXT NOT NULL,                 -- 'g' | 'mg' | 'mcg' | 'kcal'
  category            public.nutrient_category NOT NULL,
  fdc_nutrient_number TEXT,                          -- for the deferred USDA ingest
  display_order       INTEGER NOT NULL DEFAULT 0,
  -- FALSE for every micro. A coach's payload is macro-only BY CONSTRUCTION (§4.4).
  coach_visible       BOOLEAN NOT NULL DEFAULT false
);

-- ---------------------------------------------------------------------------
-- §4.1 / §4.2 — Food catalog. Global shared rows have owner_user_id IS NULL;
-- a client's custom food is owner-scoped and private until staff promote it (P3c).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.foods (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source           public.food_source NOT NULL,
  fdc_id           TEXT,
  upc              TEXT,
  name             TEXT NOT NULL,
  brand            TEXT,
  owner_user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = global shared
  category_id      UUID REFERENCES public.food_categories(id) ON DELETE SET NULL,
  tags             TEXT[] NOT NULL DEFAULT '{}',
  approval_status  public.food_approval_status NOT NULL DEFAULT 'approved',
  approved_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  serving_default_g NUMERIC(10,2) CHECK (serving_default_g IS NULL OR serving_default_g > 0),
  is_verified      BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  cached_at        TIMESTAMPTZ,                      -- branded cache-on-use (P3)
  search_tsv       TSVECTOR GENERATED ALWAYS AS (
                     to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(brand, ''))
                   ) STORED,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- A custom food MUST have an owner; a shared/global food must NOT.
  CONSTRAINT foods_custom_is_owned CHECK (
    (source = 'custom' AND owner_user_id IS NOT NULL)
    OR (source <> 'custom')
  )
);
CREATE INDEX IF NOT EXISTS idx_foods_search_tsv ON public.foods USING GIN (search_tsv);
CREATE INDEX IF NOT EXISTS idx_foods_name_trgm  ON public.foods (lower(name));
CREATE INDEX IF NOT EXISTS idx_foods_category   ON public.foods (category_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_foods_owner      ON public.foods (owner_user_id) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_foods_fdc        ON public.foods (fdc_id) WHERE fdc_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_foods_upc ON public.foods (upc) WHERE upc IS NOT NULL;

-- ---------------------------------------------------------------------------
-- §4.1 — Nutrition per 100 g, normalized (one row per food × nutrient).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_nutrients (
  food_id         UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  nutrient_id     UUID NOT NULL REFERENCES public.nutrients(id) ON DELETE CASCADE,
  amount_per_100g NUMERIC(12,4) NOT NULL CHECK (amount_per_100g >= 0),
  PRIMARY KEY (food_id, nutrient_id)
);

-- ---------------------------------------------------------------------------
-- §4.1 (D6) — Named measures. `unit_kind` + `ml_equiv` decide which units the
-- picker may offer for a food: mass always; volume only with a density; servings
-- from these rows.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_portions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id     UUID NOT NULL REFERENCES public.foods(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,                          -- '1 cup', '1 breast', '1 scoop'
  gram_weight NUMERIC(10,2) NOT NULL CHECK (gram_weight > 0),
  unit_kind   public.food_unit_kind NOT NULL DEFAULT 'serving',
  ml_equiv    NUMERIC(10,2) CHECK (ml_equiv IS NULL OR ml_equiv > 0),  -- density enabler
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (food_id, label)
);
CREATE INDEX IF NOT EXISTS idx_food_portions_food ON public.food_portions(food_id, sort_order);

-- ---------------------------------------------------------------------------
-- §4.3 — The diary. quantity_g is the normalized truth that drives ALL math;
-- kcal/macros/micros are a SNAPSHOT AT LOG TIME so a later food correction never
-- silently rewrites the client's history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_log_entries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date          DATE NOT NULL,
  meal_slot         TEXT NOT NULL DEFAULT 'breakfast',   -- configurable; not an enum by design
  logged_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULLABLE, ON DELETE SET NULL — deliberately. The snapshot below IS the historical
  -- record, so an entry does not depend on its food row surviving. RESTRICT would let a
  -- single food deletion block an account deletion; CASCADE would let it silently erase a
  -- client's logged history. SET NULL keeps the diary intact and merely makes that one
  -- entry non-re-portionable. (Normal retirement is is_active=false, not a hard delete.)
  food_id           UUID REFERENCES public.foods(id) ON DELETE SET NULL,

  quantity          NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit              public.food_log_unit NOT NULL,
  quantity_g        NUMERIC(10,2) NOT NULL CHECK (quantity_g > 0),

  -- denormalized snapshot at log time
  kcal              NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (kcal >= 0),
  protein_g         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  fat_g             NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  carb_g            NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (carb_g >= 0),
  micros            JSONB NOT NULL DEFAULT '{}'::jsonb,

  source_note       TEXT,
  -- Nullable + SET NULL: if the coach who logged an entry is later deleted, the CLIENT's
  -- entry must survive. (SET DEFAULT would re-evaluate auth.uid() at delete time -> NULL.)
  created_by_user_id UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_role   TEXT NOT NULL DEFAULT 'client'
                      CHECK (created_by_role IN ('client', 'coach', 'dietitian', 'admin')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_food_log_entries_client_date
  ON public.food_log_entries(client_id, log_date DESC);
-- Powers the add-picker's "Recent / Frequent" rows without a scan.
CREATE INDEX IF NOT EXISTS idx_food_log_entries_client_food
  ON public.food_log_entries(client_id, food_id, logged_at DESC);

-- ---------------------------------------------------------------------------
-- §4.3 — Daily rollup, derived. Trigger-maintained so it can never drift from the
-- entries it summarises (a nightly recompute job would let it lie in between).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.food_log_daily_rollup (
  client_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date        DATE NOT NULL,
  total_kcal      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_protein_g NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_fat_g     NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_carb_g    NUMERIC(10,2) NOT NULL DEFAULT 0,
  micros          JSONB NOT NULL DEFAULT '{}'::jsonb,
  entry_count     INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, log_date)
);

CREATE OR REPLACE FUNCTION public.refresh_food_log_rollup(p_client_id UUID, p_log_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.food_log_entries
  WHERE client_id = p_client_id AND log_date = p_log_date;

  IF v_count = 0 THEN
    DELETE FROM public.food_log_daily_rollup
    WHERE client_id = p_client_id AND log_date = p_log_date;
    RETURN;
  END IF;

  INSERT INTO public.food_log_daily_rollup AS r (
    client_id, log_date, total_kcal, total_protein_g, total_fat_g, total_carb_g, micros, entry_count, updated_at
  )
  SELECT
    e.client_id,
    e.log_date,
    COALESCE(sum(e.kcal), 0),
    COALESCE(sum(e.protein_g), 0),
    COALESCE(sum(e.fat_g), 0),
    COALESCE(sum(e.carb_g), 0),
    -- Sum every micro key present across the day's entries.
    COALESCE(
      (SELECT jsonb_object_agg(k, v)
       FROM (
         SELECT m.key AS k, sum((m.value)::numeric) AS v
         FROM public.food_log_entries e2, jsonb_each_text(e2.micros) AS m(key, value)
         WHERE e2.client_id = e.client_id AND e2.log_date = e.log_date
           AND (m.value ~ '^-?[0-9]+\.?[0-9]*$')
         GROUP BY m.key
       ) s),
      '{}'::jsonb
    ),
    count(*),
    now()
  FROM public.food_log_entries e
  WHERE e.client_id = p_client_id AND e.log_date = p_log_date
  GROUP BY e.client_id, e.log_date
  ON CONFLICT (client_id, log_date) DO UPDATE SET
    total_kcal      = EXCLUDED.total_kcal,
    total_protein_g = EXCLUDED.total_protein_g,
    total_fat_g     = EXCLUDED.total_fat_g,
    total_carb_g    = EXCLUDED.total_carb_g,
    micros          = EXCLUDED.micros,
    entry_count     = EXCLUDED.entry_count,
    updated_at      = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_food_log_entries_rollup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM public.refresh_food_log_rollup(OLD.client_id, OLD.log_date);
    RETURN OLD;
  END IF;

  -- An edit can MOVE an entry to another day; refresh both sides or the old day keeps a ghost.
  IF (TG_OP = 'UPDATE') AND (OLD.client_id <> NEW.client_id OR OLD.log_date <> NEW.log_date) THEN
    PERFORM public.refresh_food_log_rollup(OLD.client_id, OLD.log_date);
  END IF;

  PERFORM public.refresh_food_log_rollup(NEW.client_id, NEW.log_date);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_food_log_entries_rollup ON public.food_log_entries;
CREATE TRIGGER trg_food_log_entries_rollup
  AFTER INSERT OR UPDATE OR DELETE ON public.food_log_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_food_log_entries_rollup();

-- updated_at touch
CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_foods_touch ON public.foods;
CREATE TRIGGER trg_foods_touch BEFORE UPDATE ON public.foods
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

DROP TRIGGER IF EXISTS trg_food_log_entries_touch ON public.food_log_entries;
CREATE TRIGGER trg_food_log_entries_touch BEFORE UPDATE ON public.food_log_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Team-coach predicate. A head coach reaches their team's clients through
-- subscriptions.team_id -> coach_teams, NOT through subscriptions.coach_id, so
-- is_primary_coach_for_user() does NOT cover them (CLAUDE.md: team RLS needs its
-- own policies). SECURITY DEFINER so the policy can see subscriptions regardless
-- of the caller's own RLS on that table.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_team_coach_for_client(p_coach UUID, p_client UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    JOIN public.coach_teams ct ON s.team_id = ct.id
    WHERE s.user_id = p_client
      AND ct.coach_id = p_coach
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.food_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrients             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foods                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_nutrients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_portions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_log_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_log_daily_rollup ENABLE ROW LEVEL SECURITY;

-- Reference data: readable by any authenticated user; staff-only writes.
DROP POLICY IF EXISTS "food_categories readable" ON public.food_categories;
CREATE POLICY "food_categories readable" ON public.food_categories
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "food_categories staff write" ON public.food_categories;
CREATE POLICY "food_categories staff write" ON public.food_categories
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_approved_subrole(auth.uid(), 'dietitian'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_approved_subrole(auth.uid(), 'dietitian'));

DROP POLICY IF EXISTS "nutrients readable" ON public.nutrients;
CREATE POLICY "nutrients readable" ON public.nutrients
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "nutrients staff write" ON public.nutrients;
CREATE POLICY "nutrients staff write" ON public.nutrients
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Foods: approved GLOBAL rows are visible to everyone; a custom food is visible only
-- to its owner (+ staff). Nothing a client creates becomes shared until P3c promotes it.
DROP POLICY IF EXISTS "foods readable" ON public.foods;
CREATE POLICY "foods readable" ON public.foods
  FOR SELECT TO authenticated
  USING (
    (owner_user_id IS NULL AND approval_status = 'approved' AND is_active)
    OR owner_user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.has_approved_subrole(auth.uid(), 'dietitian')
  );

-- A client may only ever create a food that is CUSTOM and OWNED BY THEM. They cannot
-- mint a global row, and cannot self-approve one into the shared catalog.
DROP POLICY IF EXISTS "foods own custom insert" ON public.foods;
CREATE POLICY "foods own custom insert" ON public.foods
  FOR INSERT TO authenticated
  WITH CHECK (source = 'custom' AND owner_user_id = auth.uid());

DROP POLICY IF EXISTS "foods own custom update" ON public.foods;
CREATE POLICY "foods own custom update" ON public.foods
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "foods own custom delete" ON public.foods;
CREATE POLICY "foods own custom delete" ON public.foods
  FOR DELETE TO authenticated
  USING (owner_user_id = auth.uid() OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "foods staff write" ON public.foods;
CREATE POLICY "foods staff write" ON public.foods
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_approved_subrole(auth.uid(), 'dietitian'));

-- Per-food detail follows the food's own visibility — otherwise a client could read
-- another client's custom-food macros by id.
DROP POLICY IF EXISTS "food_nutrients follow food" ON public.food_nutrients;
CREATE POLICY "food_nutrients follow food" ON public.food_nutrients
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.foods f WHERE f.id = food_id));

DROP POLICY IF EXISTS "food_nutrients owner write" ON public.food_nutrients;
CREATE POLICY "food_nutrients owner write" ON public.food_nutrients
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_id AND (f.owner_user_id = auth.uid() OR public.is_admin(auth.uid())
      OR public.has_approved_subrole(auth.uid(), 'dietitian'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_id AND (f.owner_user_id = auth.uid() OR public.is_admin(auth.uid())
      OR public.has_approved_subrole(auth.uid(), 'dietitian'))
  ));

DROP POLICY IF EXISTS "food_portions follow food" ON public.food_portions;
CREATE POLICY "food_portions follow food" ON public.food_portions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.foods f WHERE f.id = food_id));

DROP POLICY IF EXISTS "food_portions owner write" ON public.food_portions;
CREATE POLICY "food_portions owner write" ON public.food_portions
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_id AND (f.owner_user_id = auth.uid() OR public.is_admin(auth.uid())
      OR public.has_approved_subrole(auth.uid(), 'dietitian'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.foods f
    WHERE f.id = food_id AND (f.owner_user_id = auth.uid() OR public.is_admin(auth.uid())
      OR public.has_approved_subrole(auth.uid(), 'dietitian'))
  ));

-- The diary. The client owns it. Care team + coach + TEAM coach + admin may READ.
-- Nobody but the client (and admin) writes it in P1 — coach/dietitian authoring is P4+,
-- and `created_by_role` is already here to carry that when it lands.
DROP POLICY IF EXISTS "food_log own" ON public.food_log_entries;
CREATE POLICY "food_log own" ON public.food_log_entries
  FOR ALL TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

DROP POLICY IF EXISTS "food_log staff read" ON public.food_log_entries;
CREATE POLICY "food_log staff read" ON public.food_log_entries
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_primary_coach_for_user(auth.uid(), client_id)
    OR public.is_team_coach_for_client(auth.uid(), client_id)
    OR public.is_care_team_member_for_client(auth.uid(), client_id)
  );

DROP POLICY IF EXISTS "food_rollup own" ON public.food_log_daily_rollup;
CREATE POLICY "food_rollup own" ON public.food_log_daily_rollup
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS "food_rollup staff read" ON public.food_log_daily_rollup;
CREATE POLICY "food_rollup staff read" ON public.food_log_daily_rollup
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_primary_coach_for_user(auth.uid(), client_id)
    OR public.is_team_coach_for_client(auth.uid(), client_id)
    OR public.is_care_team_member_for_client(auth.uid(), client_id)
  );
-- No client INSERT/UPDATE policy on the rollup: it is TRIGGER-maintained. The trigger is
-- SECURITY DEFINER and therefore bypasses RLS, so the absence of a write policy is what
-- makes the rollup un-forgeable from the client rather than merely un-edited.

-- ---------------------------------------------------------------------------
-- Search path for P1 (condition: P0-lite must expose a working food search).
--
-- `foods_search` pivots the four macro nutrients out of the normalized table so the
-- add-food sheet gets name + per-100g macros in ONE query, with no N+1. security_invoker
-- so the caller's RLS on `foods` applies unchanged — a client sees approved global rows
-- plus their own custom foods, and nobody else's.
--
-- P1 filters this with ilike(name) — exact and instant at seed scale. `search_tsv` + its
-- GIN index are already on `foods`, so P0-ingest can switch to full-text ranking over
-- ~2M USDA rows WITHOUT a schema change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.foods_search
WITH (security_invoker = true) AS
SELECT
  f.id,
  f.source,
  f.name,
  f.brand,
  f.owner_user_id,
  f.category_id,
  f.tags,
  f.serving_default_g,
  f.is_verified,
  COALESCE(max(fn.amount_per_100g) FILTER (WHERE n.key = 'energy'),  0)::numeric AS kcal_100g,
  COALESCE(max(fn.amount_per_100g) FILTER (WHERE n.key = 'protein'), 0)::numeric AS protein_100g,
  COALESCE(max(fn.amount_per_100g) FILTER (WHERE n.key = 'fat'),     0)::numeric AS fat_100g,
  COALESCE(max(fn.amount_per_100g) FILTER (WHERE n.key = 'carb'),    0)::numeric AS carb_100g
FROM public.foods f
LEFT JOIN public.food_nutrients fn ON fn.food_id = f.id
LEFT JOIN public.nutrients n       ON n.id = fn.nutrient_id
WHERE f.is_active
GROUP BY f.id;

GRANT SELECT ON public.foods_search TO authenticated;

-- RLS-predicate helper: must be executable by the querying role to evaluate the policy.
REVOKE ALL ON FUNCTION public.is_team_coach_for_client(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_team_coach_for_client(UUID, UUID) TO anon, authenticated;

-- Internal only: called by the trigger, never by a client.
REVOKE ALL ON FUNCTION public.refresh_food_log_rollup(UUID, DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_food_log_rollup(UUID, DATE) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_food_log_rollup(UUID, DATE) FROM authenticated;
