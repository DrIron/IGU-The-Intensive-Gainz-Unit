-- Add foreign key relationship hints for the profiles view
-- This allows Supabase PostgREST to understand the relationships

-- First, add comment-based relationship hints for the view
-- PostgREST uses these to build JOIN paths
COMMENT ON VIEW public.profiles IS E'@name profiles\n@primaryKey id\nCompatibility view joining profiles_public and profiles_private';

-- Create FK-like constraints on profiles_public to allow JOINs from other tables
-- Add FK from subscriptions to profiles_public
ALTER TABLE public.subscriptions 
  ADD CONSTRAINT subscriptions_user_id_profiles_public_fk 
  FOREIGN KEY (user_id) REFERENCES public.profiles_public(id);

-- Add FK from coach_change_requests to profiles_public  
ALTER TABLE public.coach_change_requests 
  ADD CONSTRAINT coach_change_requests_user_id_profiles_public_fk 
  FOREIGN KEY (user_id) REFERENCES public.profiles_public(id);

-- Add FK from care_team_assignments to profiles_public for staff
ALTER TABLE public.care_team_assignments 
  ADD CONSTRAINT care_team_assignments_staff_profiles_public_fk 
  FOREIGN KEY (staff_user_id) REFERENCES public.profiles_public(id);

-- Add FK from care_team_assignments to profiles_public for client
ALTER TABLE public.care_team_assignments 
  ADD CONSTRAINT care_team_assignments_client_profiles_public_fk 
  FOREIGN KEY (client_id) REFERENCES public.profiles_public(id);