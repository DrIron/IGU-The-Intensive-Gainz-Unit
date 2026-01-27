-- Create enums (skip billing_mode as it exists)
DO $$ BEGIN
  CREATE TYPE public.payout_type AS ENUM ('percent', 'fixed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.fee_type AS ENUM ('percent', 'fixed', 'none');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_recipient AS ENUM ('primary_coach', 'addon_staff');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ===========================================
-- Table: service_pricing
-- ===========================================
CREATE TABLE IF NOT EXISTS public.service_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  price_kwd NUMERIC NOT NULL DEFAULT 0,
  billing_mode public.billing_mode NOT NULL DEFAULT 'manual',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(service_id)
);

-- Enable RLS
ALTER TABLE public.service_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_pricing
DROP POLICY IF EXISTS "Admins can manage service_pricing" ON public.service_pricing;
CREATE POLICY "Admins can manage service_pricing"
  ON public.service_pricing FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can read active service_pricing" ON public.service_pricing;
CREATE POLICY "Authenticated users can read active service_pricing"
  ON public.service_pricing FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_service_pricing_updated_at ON public.service_pricing;
CREATE TRIGGER update_service_pricing_updated_at
  BEFORE UPDATE ON public.service_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- Table: addon_pricing (new name to avoid conflict with existing addon_catalog)
-- ===========================================
CREATE TABLE IF NOT EXISTS public.addon_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_kwd NUMERIC NOT NULL DEFAULT 0,
  is_billable BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  allowed_plan_types TEXT[] DEFAULT ARRAY['one_to_one', 'team'],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.addon_pricing ENABLE ROW LEVEL SECURITY;

-- RLS Policies for addon_pricing
DROP POLICY IF EXISTS "Admins can manage addon_pricing" ON public.addon_pricing;
CREATE POLICY "Admins can manage addon_pricing"
  ON public.addon_pricing FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated users can read active addon_pricing" ON public.addon_pricing;
CREATE POLICY "Authenticated users can read active addon_pricing"
  ON public.addon_pricing FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_addon_pricing_updated_at ON public.addon_pricing;
CREATE TRIGGER update_addon_pricing_updated_at
  BEFORE UPDATE ON public.addon_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- Table: payout_rules
-- ===========================================
CREATE TABLE IF NOT EXISTS public.payout_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  primary_payout_type public.payout_type NOT NULL DEFAULT 'percent',
  primary_payout_value NUMERIC NOT NULL DEFAULT 0,
  platform_fee_type public.fee_type NOT NULL DEFAULT 'none',
  platform_fee_value NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(service_id)
);

-- Enable RLS
ALTER TABLE public.payout_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for payout_rules
DROP POLICY IF EXISTS "Admins can manage payout_rules" ON public.payout_rules;
CREATE POLICY "Admins can manage payout_rules"
  ON public.payout_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Coaches can read payout_rules" ON public.payout_rules;
CREATE POLICY "Coaches can read payout_rules"
  ON public.payout_rules FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_payout_rules_updated_at ON public.payout_rules;
CREATE TRIGGER update_payout_rules_updated_at
  BEFORE UPDATE ON public.payout_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- Table: addon_payout_rules
-- ===========================================
CREATE TABLE IF NOT EXISTS public.addon_payout_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_id UUID NOT NULL REFERENCES public.addon_pricing(id) ON DELETE CASCADE,
  payout_type public.payout_type NOT NULL DEFAULT 'percent',
  payout_value NUMERIC NOT NULL DEFAULT 0,
  payout_recipient_role public.payout_recipient NOT NULL DEFAULT 'addon_staff',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(addon_id)
);

-- Enable RLS
ALTER TABLE public.addon_payout_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for addon_payout_rules
DROP POLICY IF EXISTS "Admins can manage addon_payout_rules" ON public.addon_payout_rules;
CREATE POLICY "Admins can manage addon_payout_rules"
  ON public.addon_payout_rules FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Coaches can read addon_payout_rules" ON public.addon_payout_rules;
CREATE POLICY "Coaches can read addon_payout_rules"
  ON public.addon_payout_rules FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'coach'));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_addon_payout_rules_updated_at ON public.addon_payout_rules;
CREATE TRIGGER update_addon_payout_rules_updated_at
  BEFORE UPDATE ON public.addon_payout_rules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ===========================================
-- Seed data: service_pricing from existing services
-- ===========================================
INSERT INTO public.service_pricing (service_id, price_kwd, billing_mode, is_active)
SELECT id, price_kwd, 'manual'::public.billing_mode, is_active
FROM public.services
ON CONFLICT (service_id) DO NOTHING;

-- ===========================================
-- Seed data: payout_rules with default 70% coach payout
-- ===========================================
INSERT INTO public.payout_rules (service_id, primary_payout_type, primary_payout_value, platform_fee_type, platform_fee_value)
SELECT id, 'percent'::public.payout_type, 70, 'percent'::public.fee_type, 30
FROM public.services
ON CONFLICT (service_id) DO NOTHING;

-- ===========================================
-- Seed data: addon_pricing with common add-ons
-- ===========================================
INSERT INTO public.addon_pricing (code, name, price_kwd, is_billable, allowed_plan_types) VALUES
  ('nutrition', 'Nutrition Coaching', 15, true, ARRAY['one_to_one', 'team']),
  ('running', 'Running Specialist', 20, true, ARRAY['one_to_one']),
  ('mobility', 'Mobility & Recovery', 15, true, ARRAY['one_to_one', 'team']),
  ('physio', 'Physiotherapy', 25, true, ARRAY['one_to_one']),
  ('mental_performance', 'Mental Performance Coach', 20, true, ARRAY['one_to_one'])
ON CONFLICT (code) DO NOTHING;

-- ===========================================
-- Seed data: addon_payout_rules (100% to addon staff by default)
-- ===========================================
INSERT INTO public.addon_payout_rules (addon_id, payout_type, payout_value, payout_recipient_role)
SELECT id, 'percent'::public.payout_type, 100, 'addon_staff'::public.payout_recipient
FROM public.addon_pricing
ON CONFLICT (addon_id) DO NOTHING;