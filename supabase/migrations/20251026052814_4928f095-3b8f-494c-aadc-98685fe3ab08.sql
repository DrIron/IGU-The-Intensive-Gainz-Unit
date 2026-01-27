-- Add missing columns to profiles table for birthdate and name fields
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS first_name TEXT,
ADD COLUMN IF NOT EXISTS last_name TEXT,
ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Add renewal date to subscriptions (end_date is when subscription ends/renews)
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS end_date TIMESTAMP WITH TIME ZONE;