-- Create function to get coach-specific analytics
CREATE OR REPLACE FUNCTION public.get_coach_analytics(coach_user_id uuid)
RETURNS TABLE(
  total_clients bigint,
  active_clients bigint,
  new_clients_week bigint,
  pending_documents bigint,
  pending_requests bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Total clients assigned to this coach
  WITH coach_clients AS (
    SELECT user_id, created_at
    FROM subscriptions
    WHERE coach_id = coach_user_id
  ),
  -- Active clients
  active AS (
    SELECT COUNT(*) as count
    FROM subscriptions
    WHERE coach_id = coach_user_id AND status = 'active'
  ),
  -- New clients this week
  new_week AS (
    SELECT COUNT(*) as count
    FROM subscriptions
    WHERE coach_id = coach_user_id 
      AND created_at >= NOW() - INTERVAL '7 days'
  ),
  -- Pending documents for coach's clients
  pending_docs AS (
    SELECT COUNT(*) as count
    FROM form_submissions fs
    WHERE fs.user_id IN (SELECT user_id FROM coach_clients)
      AND fs.documents_verified = false
  ),
  -- Pending coach change requests
  pending_reqs AS (
    SELECT COUNT(*) as count
    FROM coach_change_requests
    WHERE requested_coach_id = coach_user_id 
      AND status = 'pending'
  )
  
  SELECT 
    (SELECT COUNT(*) FROM coach_clients),
    (SELECT count FROM active),
    (SELECT count FROM new_week),
    (SELECT count FROM pending_docs),
    (SELECT count FROM pending_reqs);
$$;