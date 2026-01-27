-- Fix function search path for calculate_age function
CREATE OR REPLACE FUNCTION public.calculate_age(birth_date date)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXTRACT(YEAR FROM age(birth_date))::integer;
$$;