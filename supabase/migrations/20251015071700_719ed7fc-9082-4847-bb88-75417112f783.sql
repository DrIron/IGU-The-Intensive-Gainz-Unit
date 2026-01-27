-- Add nickname and social media fields to coaches table
ALTER TABLE public.coaches
ADD COLUMN IF NOT EXISTS nickname TEXT,
ADD COLUMN IF NOT EXISTS instagram_url TEXT,
ADD COLUMN IF NOT EXISTS tiktok_url TEXT,
ADD COLUMN IF NOT EXISTS snapchat_url TEXT,
ADD COLUMN IF NOT EXISTS youtube_url TEXT;