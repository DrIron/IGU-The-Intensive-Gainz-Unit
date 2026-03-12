-- Add payment_exempt column to profiles_public
-- Allows admins to bypass payment for specific clients
ALTER TABLE profiles_public
  ADD COLUMN IF NOT EXISTS payment_exempt BOOLEAN NOT NULL DEFAULT false;
