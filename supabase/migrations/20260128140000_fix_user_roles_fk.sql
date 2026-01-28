-- Fix user_roles foreign key constraint
-- The FK should reference auth.users, not profiles_legacy

-- First, drop the incorrect foreign key constraint
ALTER TABLE user_roles 
DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;

-- Add the correct foreign key referencing auth.users
ALTER TABLE user_roles 
ADD CONSTRAINT user_roles_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Now manually insert the admin role for admin@theigu.com
-- First, get the user ID and insert the role
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Find the user by email
  SELECT id INTO admin_user_id 
  FROM auth.users 
  WHERE email = 'admin@theigu.com';
  
  IF admin_user_id IS NOT NULL THEN
    -- Insert admin role
    INSERT INTO user_roles (user_id, role)
    VALUES (admin_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
    
    RAISE NOTICE 'Admin role granted to admin@theigu.com (user_id: %)', admin_user_id;
  ELSE
    RAISE NOTICE 'User admin@theigu.com not found in auth.users';
  END IF;
END $$;
