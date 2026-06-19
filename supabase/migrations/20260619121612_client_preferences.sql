-- Account-level client preferences (cross-device). First use: weight display unit
-- for the workout logger. Weights are ALWAYS stored canonically in kg
-- (exercise_set_logs.performed_load); this only controls how the client enters /
-- sees them. lb is a display/entry convenience, converted client-side.

CREATE TABLE IF NOT EXISTS public.client_preferences (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weight_unit text NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_preferences ENABLE ROW LEVEL SECURITY;

-- Self read/write; admin read for support. DROP-before-CREATE so the migration
-- is safe to re-apply (this project has a history of out-of-band applies).
DROP POLICY IF EXISTS "client_preferences_select_own" ON public.client_preferences;
CREATE POLICY "client_preferences_select_own" ON public.client_preferences
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "client_preferences_insert_own" ON public.client_preferences;
CREATE POLICY "client_preferences_insert_own" ON public.client_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "client_preferences_update_own" ON public.client_preferences;
CREATE POLICY "client_preferences_update_own" ON public.client_preferences
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.client_preferences TO authenticated;

DROP TRIGGER IF EXISTS update_client_preferences_updated_at ON public.client_preferences;
CREATE TRIGGER update_client_preferences_updated_at
  BEFORE UPDATE ON public.client_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
