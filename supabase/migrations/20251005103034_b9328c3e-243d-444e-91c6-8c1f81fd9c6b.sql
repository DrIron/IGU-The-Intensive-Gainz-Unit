-- Update account_status enum to include all new statuses
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'needs_medical_review';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'pending_payment';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'expired';

-- Add Discord role ID mapping to services table
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS discord_role_id TEXT;

-- Add payment deadline tracking to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS payment_deadline TIMESTAMP WITH TIME ZONE;

-- Update form_submissions to track cancellation
ALTER TABLE public.form_submissions
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;