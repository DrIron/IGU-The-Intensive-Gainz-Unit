-- Drop the old name column from coaches table since we now use first_name and last_name
ALTER TABLE coaches 
DROP COLUMN IF EXISTS name;