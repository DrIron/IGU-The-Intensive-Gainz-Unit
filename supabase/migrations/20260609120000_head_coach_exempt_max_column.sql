-- Head-coach payment-exempt clients: per-coach cap.
-- Admin-editable limit on how many active payment-exempt ("test drive") clients
-- a head coach may create for themselves. NULL = fall back to the app default
-- (see DEFAULT_EXEMPT_CAP in create-manual-client). New column, NOT one of the
-- deprecated coaches_public.max_*_clients columns slated for Phase 3 drop.
ALTER TABLE public.coaches_public
  ADD COLUMN IF NOT EXISTS max_exempt_clients integer;

COMMENT ON COLUMN public.coaches_public.max_exempt_clients IS
  'Max active payment-exempt clients a head coach may self-create. NULL = app default (5). Admin-editable in ProfessionalLevelManager.';
