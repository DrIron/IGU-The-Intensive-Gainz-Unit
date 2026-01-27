-- Add date_of_birth column to nutrition_goals if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'nutrition_goals' 
    AND column_name = 'date_of_birth'
  ) THEN
    ALTER TABLE nutrition_goals ADD COLUMN date_of_birth DATE;
  END IF;
END $$;

-- Add comment explaining the age columns are deprecated
COMMENT ON COLUMN coaches.age IS 'Deprecated: Use date_of_birth instead. Age is calculated automatically.';
COMMENT ON COLUMN nutrition_goals.age IS 'Deprecated: Use date_of_birth instead. Age is calculated automatically.';