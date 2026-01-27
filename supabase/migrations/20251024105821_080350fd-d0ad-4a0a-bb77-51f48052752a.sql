-- Add date_of_birth columns to relevant tables
ALTER TABLE coaches ADD COLUMN date_of_birth DATE;
ALTER TABLE nutrition_goals ADD COLUMN date_of_birth DATE;

-- Create a function to calculate age from date of birth
CREATE OR REPLACE FUNCTION calculate_age(birth_date DATE)
RETURNS INTEGER AS $$
BEGIN
  IF birth_date IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN DATE_PART('year', AGE(birth_date));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add comment explaining the age columns are deprecated
COMMENT ON COLUMN coaches.age IS 'Deprecated: Use date_of_birth instead. Age is calculated automatically.';
COMMENT ON COLUMN nutrition_goals.age IS 'Deprecated: Use date_of_birth instead. Age is calculated automatically.';