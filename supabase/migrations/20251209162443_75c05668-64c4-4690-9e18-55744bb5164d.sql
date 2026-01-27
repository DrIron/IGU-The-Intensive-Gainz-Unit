-- Step 1: Add new columns to discount_codes (enum types already exist from partial migration)
ALTER TABLE public.discount_codes 
ADD COLUMN IF NOT EXISTS duration_type text,
ADD COLUMN IF NOT EXISTS duration_cycles integer;

-- Step 2: Migrate existing applies_to data to duration_type using text comparison
UPDATE public.discount_codes
SET duration_type = CASE 
  WHEN applies_to::text = 'first_payment' THEN 'one_time'
  WHEN applies_to::text = 'recurring' AND max_cycles IS NOT NULL THEN 'limited_cycles'
  WHEN applies_to::text = 'recurring' AND max_cycles IS NULL THEN 'lifetime'
  WHEN applies_to::text = 'all' THEN 'lifetime'
  ELSE 'one_time'
END,
duration_cycles = max_cycles
WHERE duration_type IS NULL;

-- Step 3: Set default for duration_type
ALTER TABLE public.discount_codes 
ALTER COLUMN duration_type SET DEFAULT 'one_time';

-- Step 4: Add columns to discount_redemptions for tracking
ALTER TABLE public.discount_redemptions
ADD COLUMN IF NOT EXISTS cycles_applied integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS cycles_remaining integer,
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS total_saved_kwd numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS first_applied_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS last_applied_at timestamptz DEFAULT now();

-- Step 5: Update existing redemptions with calculated values
UPDATE public.discount_redemptions
SET 
  total_saved_kwd = COALESCE(amount_before_kwd - amount_after_kwd, 0),
  cycles_applied = 1,
  status = 'exhausted'
WHERE total_saved_kwd = 0;

-- Step 6: Create unique constraint for one redemption record per user per subscription per code
CREATE UNIQUE INDEX IF NOT EXISTS idx_discount_redemptions_unique 
ON public.discount_redemptions (discount_code_id, user_id, subscription_id);

-- Step 7: Add updated_at column if not exists and trigger for discount_codes
ALTER TABLE public.discount_codes 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_discount_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_discount_codes_updated_at ON public.discount_codes;
CREATE TRIGGER update_discount_codes_updated_at
BEFORE UPDATE ON public.discount_codes
FOR EACH ROW
EXECUTE FUNCTION public.update_discount_codes_updated_at();

-- Step 8: Add check constraint for status values
ALTER TABLE public.discount_redemptions
DROP CONSTRAINT IF EXISTS discount_redemptions_status_check;

ALTER TABLE public.discount_redemptions
ADD CONSTRAINT discount_redemptions_status_check 
CHECK (status IN ('active', 'exhausted', 'cancelled'));

-- Step 9: Add check constraint for duration_type values
ALTER TABLE public.discount_codes
DROP CONSTRAINT IF EXISTS discount_codes_duration_type_check;

ALTER TABLE public.discount_codes
ADD CONSTRAINT discount_codes_duration_type_check 
CHECK (duration_type IN ('one_time', 'limited_cycles', 'lifetime'));