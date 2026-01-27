-- Add WhatsApp number to coaches table
ALTER TABLE coaches ADD COLUMN whatsapp_number text;
COMMENT ON COLUMN coaches.whatsapp_number IS 'Coach WhatsApp number with country code for client communication';

-- Add tracking fields for analytics
ALTER TABLE profiles ADD COLUMN signup_completed_at timestamp with time zone;
ALTER TABLE profiles ADD COLUMN onboarding_completed_at timestamp with time zone;
ALTER TABLE profiles ADD COLUMN activation_completed_at timestamp with time zone;

-- Create function for admin analytics (instead of view to avoid RLS issues)
CREATE OR REPLACE FUNCTION get_admin_analytics()
RETURNS TABLE (
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
    (SELECT COALESCE(SUM(s.price_kwd), 0) FROM subscriptions sub 
     JOIN services s ON sub.service_id = s.id 
     WHERE sub.status = 'active'),
    (SELECT COUNT(*) FROM profiles WHERE status = 'pending'),
    (SELECT COUNT(*) FROM testimonials WHERE is_approved = false AND is_archived = false);
$$;

-- Add email notification tracking
CREATE TABLE IF NOT EXISTS email_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  notification_type text NOT NULL,
  sent_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'sent'
);

ALTER TABLE email_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all notifications"
  ON email_notifications
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own notifications"
  ON email_notifications
  FOR SELECT
  USING (auth.uid() = user_id);