-- Email Types catalog for Admin Email Manager
-- Allows admin to see all email types, toggle drip sequences on/off,
-- and edit email content (subject + body) without code changes.

CREATE TABLE email_types (
  id TEXT PRIMARY KEY,                -- matches notification_type in email_notifications
  category TEXT NOT NULL,             -- grouping: drip_lead_nurture, transactional, etc.
  label TEXT NOT NULL,                -- human-readable name
  description TEXT,                   -- when/why this email fires
  edge_function TEXT NOT NULL,        -- which edge function sends this
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  subject_template TEXT,              -- NULL = use hardcoded default
  body_sections JSONB,                -- NULL = use hardcoded default
  sort_order INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- RLS: admin-only
ALTER TABLE email_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read email_types"
  ON email_types FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update email_types"
  ON email_types FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert email_types"
  ON email_types FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Seed all known email types
INSERT INTO email_types (id, category, label, description, edge_function, is_enabled, sort_order) VALUES
  -- Lead Nurture Drip
  ('lead_nurture_day2',      'drip_lead_nurture',         'Lead Nurture -- Day 2',       'Value proposition email sent 2 days after newsletter signup',              'process-lead-nurture',            true, 10),
  ('lead_nurture_day5',      'drip_lead_nurture',         'Lead Nurture -- Day 5',       'Meet the coaches email sent 5 days after newsletter signup',               'process-lead-nurture',            true, 11),
  ('lead_nurture_day10',     'drip_lead_nurture',         'Lead Nurture -- Day 10',      'Urgency/pricing email sent 10 days after newsletter signup',               'process-lead-nurture',            true, 12),

  -- Abandoned Onboarding Drip
  ('abandoned_onboarding_day1', 'drip_abandoned_onboarding', 'Abandoned Onboarding -- Day 1', 'Reminder sent 1 day after incomplete onboarding draft',                 'process-abandoned-onboarding',    true, 20),
  ('abandoned_onboarding_day3', 'drip_abandoned_onboarding', 'Abandoned Onboarding -- Day 3', 'Follow-up sent 3 days after incomplete onboarding draft',               'process-abandoned-onboarding',    true, 21),
  ('abandoned_onboarding_day7', 'drip_abandoned_onboarding', 'Abandoned Onboarding -- Day 7', 'Final reminder sent 7 days after incomplete onboarding draft',          'process-abandoned-onboarding',    true, 22),

  -- Payment Failure Drip
  ('payment_failure_day1',   'drip_payment_failure',      'Payment Failure -- Day 1',    'Immediate notification when payment fails',                                'process-payment-failure-drip',    true, 30),
  ('payment_failure_day2',   'drip_payment_failure',      'Payment Failure -- Day 2',    'Second reminder about failed payment',                                     'process-payment-failure-drip',    true, 31),
  ('payment_failure_coach_notify', 'drip_payment_failure', 'Payment Failure -- Coach Notify', 'Notifies coach when client payment fails (day 5)',                    'process-payment-failure-drip',    true, 32),
  ('payment_failure_day9',   'drip_payment_failure',      'Payment Failure -- Day 9',    'Final warning before account suspension',                                  'process-payment-failure-drip',    true, 33),

  -- Lifecycle Drip
  ('renewal_reminder',       'drip_lifecycle',            'Renewal Reminder',            'Billing renewal notice sent 3 days before next billing date',               'process-renewal-reminders',       true, 40),
  ('testimonial_request',    'drip_lifecycle',            'Testimonial Request',         'Requests testimonial from clients after 4+ weeks active (lifetime dedup)',  'process-testimonial-requests',    true, 41),
  ('referral_reminder',      'drip_lifecycle',            'Referral Reminder',           'Reminds clients about referral program after 2+ weeks active',              'process-referral-reminders',      true, 42),

  -- Admin Alerts
  ('inactive_client_coach_alert', 'admin_alert',          'Inactive Client Alert',       'Alerts coach when client hasn''t trained in 5+ days',                      'process-inactive-client-alerts',  true, 50),
  ('coach_inactivity_admin_alert','admin_alert',          'Coach Inactivity Alert',      'Alerts admins when coach hasn''t logged in 7+ days',                       'process-coach-inactivity-monitor',true, 51),
  ('admin_daily_summary',    'admin_alert',               'Admin Daily Summary',         'Daily platform health snapshot sent to admins',                             'send-admin-daily-summary',        true, 52),
  ('weekly_coach_digest',    'admin_alert',               'Weekly Coach Digest',         'Weekly per-coach summary of clients and activity',                          'send-weekly-coach-digest',        true, 53),

  -- Transactional (read-only in UI -- these should not be toggled off)
  ('welcome_email',          'transactional',             'Welcome Email',               'Sent when client becomes active after payment',                             'submit-onboarding',              true, 60),
  ('signup_confirmation',    'transactional',             'Signup Confirmation',         'Sent when user creates an account',                                         'submit-onboarding',              true, 61),
  ('waitlist_confirmation',  'transactional',             'Waitlist Confirmation',       'Sent when user joins the waitlist',                                         'send-waitlist-confirmation',     true, 62),
  ('waitlist_invite',        'transactional',             'Waitlist Invite',             'Sent when admin invites waitlist leads',                                    'send-waitlist-invites',          true, 63),
  ('coach_invitation',       'transactional',             'Coach Invitation',            'Password setup email sent to newly approved coaches',                       'send-coach-invitation',          true, 64),
  ('coach_application',      'transactional',             'Coach Application Confirmation','Confirmation email when coach submits application',                      'send-coach-application-emails',  true, 65),
  ('coach_new_client',       'transactional',             'Coach New Client',            'Notifies coach when new client is assigned to them',                        'submit-onboarding',              true, 66),
  ('client_approval',        'transactional',             'Client Approval',             'Sent when client is approved by coach',                                     'submit-onboarding',              true, 67),
  ('payment_failed',         'transactional',             'Payment Failed (Immediate)',   'Immediate payment failure notification from webhook',                      'tap-webhook',                    true, 68),
  ('billing_reminder',       'transactional',             'Billing Reminder',            'Upcoming billing reminder',                                                 'process-renewal-reminders',      true, 69);
