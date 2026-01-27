-- Update exercises table RLS policies to allow only admins (not coaches) to manage exercises

-- Drop existing policies
DROP POLICY IF EXISTS "Coaches and admins can insert exercises" ON exercises;
DROP POLICY IF EXISTS "Coaches and admins can update exercises" ON exercises;
DROP POLICY IF EXISTS "Coaches and admins can delete exercises" ON exercises;

-- Create new admin-only policies
CREATE POLICY "Only admins can insert exercises"
ON exercises
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can update exercises"
ON exercises
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Only admins can delete exercises"
ON exercises
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));