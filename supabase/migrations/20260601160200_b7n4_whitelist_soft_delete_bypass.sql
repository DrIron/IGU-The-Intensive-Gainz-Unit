-- B7-N12 support: extend the B7-N4 subscription column whitelist trigger with an
-- `app.in_soft_delete_team` bypass, mirroring the existing `app.in_join_team`
-- branch. soft_delete_team_atomic NULLs team_id/coach_id on member subs; branch 4
-- (caller <> OLD.user_id) already permits that for normal members, but a head
-- coach who is ALSO a member of their own team would hit branch 5 (deny) on their
-- own sub. The flag closes that edge without weakening any other enforcement.
-- Verbatim prod body (pg_get_functiondef 2026-06-01) + the one new branch.
CREATE OR REPLACE FUNCTION public.enforce_subscription_column_whitelist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- 1. service_role / postgres / migrations (no JWT -> auth.uid() IS NULL).
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Admins manage subscriptions through admin tooling.
  IF public.is_admin(v_caller) THEN
    RETURN NEW;
  END IF;

  -- 3. Authorized SECURITY DEFINER RPC (join_team) sets this txn-local flag.
  IF current_setting('app.in_join_team', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- 3b. Authorized SECURITY DEFINER RPC (soft_delete_team_atomic) sets this
  --     txn-local flag (B7-N12). Covers the head-coach-is-own-team-member edge.
  IF current_setting('app.in_soft_delete_team', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- 4. Writers acting on someone else's subscription (coach activating /
  --    cancelling a client's sub, coach-on-own-client) are governed by RLS,
  --    not this trigger. Only client-as-self writes are locked here.
  IF v_caller <> OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- 5. A non-admin client editing their OWN subscription row directly: deny.
  RAISE EXCEPTION
    'subscriptions is not directly user-writable -- route through join_team() or the cancel-subscription / payment edge functions'
    USING ERRCODE = '42501';
END;
$function$;
