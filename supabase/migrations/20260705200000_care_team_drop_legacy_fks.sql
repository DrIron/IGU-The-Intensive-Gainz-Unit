-- Care-team assignment was blocked by leftover profiles_legacy FKs. care_team_assignments carried
-- duplicate FKs on staff_user_id and client_id (each referencing BOTH profiles_legacy and
-- profiles_public), plus added_by -> profiles_legacy. Staff/admins provisioned through the admin
-- edge-fn path (create-coach-account, create-specialist-account) land in profiles_public but NOT
-- profiles_legacy (that's populated by client onboarding only), so an insert had to satisfy the
-- stale legacy FK too and every properly-provisioned specialist was blocked from care-team
-- assignment (table is 0 rows on prod). Drop the 3 redundant legacy FKs, keep the profiles_public
-- ones, and repoint added_by -> profiles_public. Scope is care_team_assignments only; the separate
-- subscriptions_user_id_fkey -> profiles_legacy quirk is intentionally untouched.

ALTER TABLE public.care_team_assignments
  DROP CONSTRAINT IF EXISTS care_team_assignments_staff_user_id_fkey,
  DROP CONSTRAINT IF EXISTS care_team_assignments_client_id_fkey,
  DROP CONSTRAINT IF EXISTS care_team_assignments_added_by_fkey;

-- added_by had no profiles_public replacement; add one (nullable, SET NULL on delete).
ALTER TABLE public.care_team_assignments
  ADD CONSTRAINT care_team_assignments_added_by_public_fk
  FOREIGN KEY (added_by) REFERENCES public.profiles_public(id) ON DELETE SET NULL;

-- Preserve prior behavior: the dropped legacy client_id FK had ON DELETE CASCADE, but the surviving
-- profiles_public FK on client_id had NO ACTION. Recreate it with ON DELETE CASCADE so deleting a
-- client still cascades their care-team rows. Staff (staff_profiles_public_fk) stays NO ACTION on
-- purpose -- don't silently drop assignments if a staff row is removed; surface it instead.
ALTER TABLE public.care_team_assignments
  DROP CONSTRAINT IF EXISTS care_team_assignments_client_profiles_public_fk;
ALTER TABLE public.care_team_assignments
  ADD CONSTRAINT care_team_assignments_client_profiles_public_fk
  FOREIGN KEY (client_id) REFERENCES public.profiles_public(id) ON DELETE CASCADE;
