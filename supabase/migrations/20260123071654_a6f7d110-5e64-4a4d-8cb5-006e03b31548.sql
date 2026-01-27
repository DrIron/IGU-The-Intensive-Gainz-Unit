-- Set the PHI encryption key from the vault secret
-- This needs to be done via ALTER DATABASE or session settings

-- First, let's update the get_phi_encryption_key function to use the vault
CREATE OR REPLACE FUNCTION public.get_phi_encryption_key()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  key_value text;
BEGIN
  -- First try app settings (for backwards compatibility)
  key_value := current_setting('app.phi_encryption_key', true);
  
  -- If not set via app settings, try to get from vault
  IF key_value IS NULL OR key_value = '' THEN
    SELECT decrypted_secret INTO key_value 
    FROM vault.decrypted_secrets 
    WHERE name = 'PHI_ENCRYPTION_KEY'
    LIMIT 1;
  END IF;
  
  IF key_value IS NULL OR key_value = '' THEN
    RAISE EXCEPTION 'PHI_ENCRYPTION_KEY is not configured. Cannot proceed with encryption.';
  END IF;
  
  RETURN key_value;
END;
$function$;

-- Now let's re-encrypt existing data by triggering an update on form_submissions
-- This will run the encrypt_phi_on_form_submission trigger
-- (We'll do this manually or via a separate function to avoid mass updates)