-- CP6 added apply_subscription_change(uuid, text, boolean); drop the legacy 2-arg
-- overload so callers unambiguously bind to the guarded 3-arg version.
DROP FUNCTION IF EXISTS public.apply_subscription_change(uuid, text);
