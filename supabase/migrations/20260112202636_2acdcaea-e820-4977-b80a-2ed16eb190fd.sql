-- Add module flags to services table
ALTER TABLE public.services
ADD COLUMN includes_primary_coaching boolean DEFAULT true,
ADD COLUMN includes_nutrition_support boolean DEFAULT false,
ADD COLUMN includes_specialty_support boolean DEFAULT false,
ADD COLUMN includes_physio_support boolean DEFAULT false;

-- Set includes_primary_coaching = true for existing one_to_one services
UPDATE public.services
SET includes_primary_coaching = true
WHERE type = 'one_to_one';

-- Set includes_primary_coaching = false for existing team services (optional coaching)
UPDATE public.services
SET includes_primary_coaching = false
WHERE type = 'team';

-- Add comment for documentation
COMMENT ON COLUMN public.services.includes_primary_coaching IS 'Whether this plan includes primary coaching (always true for 1:1 plans)';
COMMENT ON COLUMN public.services.includes_nutrition_support IS 'Whether this plan includes nutrition support module';
COMMENT ON COLUMN public.services.includes_specialty_support IS 'Whether this plan includes specialty coaching (bodybuilding, powerlifting, etc.)';
COMMENT ON COLUMN public.services.includes_physio_support IS 'Whether this plan includes physiotherapy support';