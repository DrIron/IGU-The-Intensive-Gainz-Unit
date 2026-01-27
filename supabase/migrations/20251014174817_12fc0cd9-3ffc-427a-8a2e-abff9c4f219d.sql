-- Add profile_picture_url column to coaches table
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS profile_picture_url text;

-- Add short_bio column for the card view
ALTER TABLE coaches ADD COLUMN IF NOT EXISTS short_bio text;