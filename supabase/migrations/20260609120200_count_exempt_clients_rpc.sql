-- Count a coach's ACTIVE payment-exempt clients. Used by:
--   - the head-coach "Add Payment Exempt Client" UI (cap-remaining display), and
--   - create-manual-client's cap enforcement (called with service role).
-- Authorization: service_role (edge fn) OR admin OR the coach themselves.
-- Single CREATE FUNCTION per file, no trailing statements (Supabase CLI
-- dollar-quote splitter mishandles trailing statements after long bodies).
CREATE OR REPLACE FUNCTION public.count_active_exempt_clients_for_coach(p_coach_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role   TEXT;
  v_caller UUID;
  v_count  INTEGER;
BEGIN
  v_role := COALESCE(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  v_caller := auth.uid();

  IF v_role <> 'service_role' THEN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.is_admin(v_caller) OR v_caller = p_coach_id) THEN
      RAISE EXCEPTION 'permission denied: must be admin or the coach' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COUNT(*)::int INTO v_count
  FROM public.subscriptions s
  JOIN public.profiles_public pp ON pp.id = s.user_id
  WHERE s.coach_id = p_coach_id
    AND s.status = 'active'
    AND pp.payment_exempt = true;

  RETURN COALESCE(v_count, 0);
END;
$function$;
