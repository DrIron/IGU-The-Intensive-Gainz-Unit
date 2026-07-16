-- Perf: guard the staff-write policy against the client self-write hot path. No behavior change.
--
-- `food_log staff write` calls can_edit_nutrition(auth.uid(), client_id), which does NOT
-- short-circuit the self case — a client logging their OWN food paid ~4 relationship lookups
-- before the buried `actor = client` check. That client already writes via "food_log own"
-- (client_id = auth.uid()), so the staff policy evaluating on a self-write is pure waste.
--
-- Add a cheap `(SELECT auth.uid()) <> client_id` self-skip BEFORE can_edit_nutrition: a
-- self-write short-circuits to false and never calls the function; a staff write
-- (auth.uid() <> client_id) evaluates can_edit_nutrition exactly as before. Net results are
-- identical (RLS policies OR together, and the self case is still covered by "food_log own") —
-- only the wasted self-case function calls are removed.
--
-- auth.uid() is wrapped as (SELECT auth.uid()) per Supabase RLS perf guidance so the planner
-- evaluates it once per query via an InitPlan instead of once per row.

DROP POLICY "food_log staff write" ON public.food_log_entries;
CREATE POLICY "food_log staff write" ON public.food_log_entries
  FOR ALL TO authenticated
  USING (
    (SELECT auth.uid()) <> client_id
    AND public.can_edit_nutrition((SELECT auth.uid()), client_id)
  )
  WITH CHECK (
    (SELECT auth.uid()) <> client_id
    AND public.can_edit_nutrition((SELECT auth.uid()), client_id)
  );
