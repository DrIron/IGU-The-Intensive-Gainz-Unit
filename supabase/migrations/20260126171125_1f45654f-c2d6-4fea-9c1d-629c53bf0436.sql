-- Create function to get tables without RLS enabled
CREATE OR REPLACE FUNCTION public.get_tables_without_rls()
RETURNS TABLE(table_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.relname::text as table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = false
  ORDER BY 1;
$$;

-- Create function to get views without security_invoker
CREATE OR REPLACE FUNCTION public.get_views_without_security_invoker()
RETURNS TABLE(view_name text, reloptions text[])
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.relname::text as view_name,
    c.reloptions
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND (c.reloptions IS NULL OR NOT EXISTS (
      SELECT 1
      FROM unnest(c.reloptions) opt
      WHERE opt = 'security_invoker=true'
    ))
  ORDER BY 1;
$$;

-- Create function to get policies with USING(true)
CREATE OR REPLACE FUNCTION public.get_policies_with_true_qual()
RETURNS TABLE(
  schemaname name,
  tablename name,
  policyname name,
  cmd text,
  roles name[],
  qual text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    schemaname,
    tablename,
    policyname,
    cmd,
    roles,
    qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND qual = '(true)'
  ORDER BY tablename, policyname;
$$;

-- Restrict to service_role only (admin accesses via edge function)
REVOKE EXECUTE ON FUNCTION public.get_tables_without_rls() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tables_without_rls() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tables_without_rls() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.get_views_without_security_invoker() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_views_without_security_invoker() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_views_without_security_invoker() FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.get_policies_with_true_qual() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_policies_with_true_qual() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_policies_with_true_qual() FROM authenticated;