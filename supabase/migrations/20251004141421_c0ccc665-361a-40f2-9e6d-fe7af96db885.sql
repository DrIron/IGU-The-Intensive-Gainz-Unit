-- Add coach assignment to subscriptions
ALTER TABLE public.subscriptions 
ADD COLUMN coach_id uuid REFERENCES public.coaches(user_id);

-- Create enum for account status if it doesn't exist
DO $$ BEGIN
  CREATE TYPE account_status AS ENUM ('pending', 'approved', 'active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update RLS policies for coaches to manage their clients
CREATE POLICY "Coaches can view their assigned clients' subscriptions"
ON public.subscriptions
FOR SELECT
USING (
  auth.uid() IN (SELECT user_id FROM public.coaches WHERE user_id = coach_id)
);

-- Allow coaches to update their assigned clients' profiles
CREATE POLICY "Coaches can update their assigned clients' profiles"
ON public.profiles
FOR UPDATE
USING (
  id IN (
    SELECT user_id 
    FROM public.subscriptions 
    WHERE coach_id IN (SELECT user_id FROM public.coaches WHERE user_id = auth.uid())
  )
);