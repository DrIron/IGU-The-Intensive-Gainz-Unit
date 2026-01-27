-- Add first_name and last_name columns to coaches table
ALTER TABLE coaches 
ADD COLUMN first_name text,
ADD COLUMN last_name text;

-- Migrate existing name data to first_name (temporary solution)
-- Admin can update these manually later if needed
UPDATE coaches 
SET first_name = split_part(name, ' ', 1),
    last_name = CASE 
      WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
      ELSE ''
    END
WHERE first_name IS NULL;

-- Make first_name required for new entries going forward
ALTER TABLE coaches 
ALTER COLUMN first_name SET NOT NULL;

-- last_name can remain nullable for single-name cases
ALTER TABLE coaches 
ALTER COLUMN last_name SET DEFAULT '';