-- =========================================================================
-- Store activity level on the client profile so calculators + coach form
-- can pre-fill it instead of re-asking every phase / every session.
--
-- Nutrition audit (Apr 21) flagged this as the most re-asked field outside
-- of the weight/BF% pair. Every phase create on the coach side, every
-- self-service calculator pass, every onboarding -- and none of them
-- remembered what the client picked before.
--
-- Activity level is not PHI (doesn't identify anyone), so it lives on
-- profiles_public. Coaches can read it directly via existing RLS (they
-- already have SELECT on profiles_public for active-status clients) --
-- no SECURITY DEFINER RPC needed.
--
-- Values match the Mifflin-St Jeor multipliers the rest of the nutrition
-- code uses: 1.2 (sedentary), 1.375 (light), 1.55 (moderate),
-- 1.725 (very active), 1.9 (extremely active). Stored as TEXT so the
-- calculator's Select value round-trips without any coercion.
-- =========================================================================

ALTER TABLE public.profiles_public
  ADD COLUMN IF NOT EXISTS activity_level TEXT
  CHECK (activity_level IS NULL OR activity_level IN ('1.2', '1.375', '1.55', '1.725', '1.9'));

COMMENT ON COLUMN public.profiles_public.activity_level IS
  'Client activity multiplier for BMR -> TDEE calc. One of the five standard Mifflin-St Jeor values. NULL until the client sets it via onboarding, account settings, or the first successful calorie calculator run.';
