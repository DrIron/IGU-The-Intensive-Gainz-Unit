-- Update admin analytics function to exclude payment-exempt clients from revenue
CREATE OR REPLACE FUNCTION public.get_admin_analytics()
RETURNS TABLE(
  new_signups_week bigint,
  active_subscriptions bigint,
  total_monthly_revenue numeric,
  pending_approvals bigint,
  pending_testimonials bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    (SELECT COUNT(*) FROM profiles WHERE created_at >= NOW() - INTERVAL '7 days'),
    (SELECT COUNT(*) FROM subscriptions WHERE status = 'active'),
    (SELECT COALESCE(SUM(s.price_kwd), 0) 
     FROM subscriptions sub 
     JOIN services s ON sub.service_id = s.id 
     JOIN profiles p ON sub.user_id = p.id
     WHERE sub.status = 'active' 
       AND (p.payment_exempt = false OR p.payment_exempt IS NULL)),
    (SELECT COUNT(*) FROM profiles WHERE status = 'pending'),
    (SELECT COUNT(*) FROM testimonials WHERE is_approved = false AND is_archived = false);
$$;