-- Add status values for pending coach approval
-- The subscriptions.status field already exists as text type, so we just need to use appropriate status values

-- Update RLS policies to allow coaches to see pending approvals assigned to them
DROP POLICY IF EXISTS "Coaches can view their assigned clients' subscriptions" ON public.subscriptions;

CREATE POLICY "Coaches can view their assigned or pending clients' subscriptions"
ON public.subscriptions
FOR SELECT
USING (
  auth.uid() IN (
    SELECT coaches.user_id
    FROM coaches
    WHERE coaches.user_id = subscriptions.coach_id
  )
);