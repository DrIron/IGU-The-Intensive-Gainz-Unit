-- Waitlist settings: single-row table (same pattern as team_plan_settings)
CREATE TABLE waitlist_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  heading TEXT DEFAULT 'Coming Soon',
  subheading TEXT DEFAULT 'We''re building something great. Join the waitlist to be first in line.',
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- RLS: anon can read (needed by WaitlistGuard before auth), admin can write
ALTER TABLE waitlist_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read waitlist settings"
  ON waitlist_settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins can update waitlist settings"
  ON waitlist_settings FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert waitlist settings"
  ON waitlist_settings FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Track which leads have been invited
ALTER TABLE leads ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- Seed default row (waitlist OFF by default)
INSERT INTO waitlist_settings (is_enabled, heading, subheading)
VALUES (false, 'Coming Soon', 'We''re building something great. Join the waitlist to be first in line.');

-- Auto-update timestamp on change
CREATE TRIGGER update_waitlist_settings_updated_at
  BEFORE UPDATE ON waitlist_settings FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
