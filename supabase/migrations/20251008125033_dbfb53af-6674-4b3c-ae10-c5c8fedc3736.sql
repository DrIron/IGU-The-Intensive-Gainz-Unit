-- Assign admin as coach to team plan subscriptions that don't have a coach assigned
UPDATE subscriptions s
SET coach_id = (
  SELECT ur.user_id 
  FROM user_roles ur 
  WHERE ur.role = 'admin' 
  LIMIT 1
)
WHERE s.coach_id IS NULL 
  AND s.service_id IN (
    SELECT id FROM services WHERE type = 'team'
  )
  AND s.status IN ('active', 'pending', 'pending_payment');