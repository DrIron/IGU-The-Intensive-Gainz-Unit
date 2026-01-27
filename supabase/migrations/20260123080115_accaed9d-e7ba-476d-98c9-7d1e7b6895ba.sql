-- Fix the encryption functions to use correct argument types for pgp_sym_encrypt

CREATE OR REPLACE FUNCTION public.encrypt_phi_text(plain_text text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF plain_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- pgp_sym_encrypt takes (text, text) and returns bytea
  RETURN encode(
    extensions.pgp_sym_encrypt(plain_text, get_phi_encryption_key()),
    'base64'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_phi_boolean(bool_value boolean)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF bool_value IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN encode(
    extensions.pgp_sym_encrypt(bool_value::text, get_phi_encryption_key()),
    'base64'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.encrypt_phi_date(date_value date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF date_value IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN encode(
    extensions.pgp_sym_encrypt(date_value::text, get_phi_encryption_key()),
    'base64'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_phi_text(encrypted_text text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  RETURN extensions.pgp_sym_decrypt(
    decode(encrypted_text, 'base64'),
    get_phi_encryption_key()
  )::text;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_phi_boolean(encrypted_text text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  decrypted_value text;
BEGIN
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  decrypted_value := extensions.pgp_sym_decrypt(
    decode(encrypted_text, 'base64'),
    get_phi_encryption_key()
  )::text;
  
  RETURN decrypted_value::boolean;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.decrypt_phi_date(encrypted_text text)
 RETURNS date
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  decrypted_value text;
BEGIN
  IF encrypted_text IS NULL THEN
    RETURN NULL;
  END IF;
  
  decrypted_value := extensions.pgp_sym_decrypt(
    decode(encrypted_text, 'base64'),
    get_phi_encryption_key()
  )::text;
  
  RETURN decrypted_value::date;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$function$;