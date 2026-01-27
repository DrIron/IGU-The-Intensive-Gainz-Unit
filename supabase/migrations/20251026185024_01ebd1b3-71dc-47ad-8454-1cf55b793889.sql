-- Add gender column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;

-- Add gender column to coaches table  
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS gender text;

-- Add gender column to coach_applications table
ALTER TABLE public.coach_applications ADD COLUMN IF NOT EXISTS gender text;