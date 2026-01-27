
-- Create addon_catalog table for admin to manage default addon pricing
CREATE TABLE public.addon_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  specialty public.staff_specialty NOT NULL,
  default_name TEXT NOT NULL,
  default_price_kwd NUMERIC NOT NULL DEFAULT 0,
  default_payout_kwd NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create subscription_addons table for tracking billable add-ons per subscription
CREATE TABLE public.subscription_addons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id),
  specialty public.staff_specialty NOT NULL,
  staff_user_id UUID REFERENCES public.profiles(id),
  name TEXT NOT NULL,
  price_kwd NUMERIC NOT NULL DEFAULT 0,
  payout_kwd NUMERIC NOT NULL DEFAULT 0,
  billing_type TEXT NOT NULL DEFAULT 'recurring' CHECK (billing_type IN ('recurring', 'one_time')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  start_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  end_date TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add new columns to subscriptions for billing snapshots
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS addons_total_kwd NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_price_kwd NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS tap_amount_kwd NUMERIC DEFAULT 0;

-- Create unique partial index to prevent duplicate active addons per subscription + specialty
CREATE UNIQUE INDEX idx_subscription_addons_unique_active 
ON public.subscription_addons (subscription_id, specialty) 
WHERE status = 'active';

-- Enable RLS on addon_catalog
ALTER TABLE public.addon_catalog ENABLE ROW LEVEL SECURITY;

-- RLS policies for addon_catalog
CREATE POLICY "Admins can manage addon catalog"
ON public.addon_catalog FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view active addons"
ON public.addon_catalog FOR SELECT
USING (is_active = true AND auth.uid() IS NOT NULL);

-- Enable RLS on subscription_addons
ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;

-- RLS policies for subscription_addons
CREATE POLICY "Admins can manage all subscription addons"
ON public.subscription_addons FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Primary coaches can manage their clients addons"
ON public.subscription_addons FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_addons.subscription_id
    AND s.coach_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_addons.subscription_id
    AND s.coach_id = auth.uid()
  )
);

CREATE POLICY "Staff can view their assigned addons"
ON public.subscription_addons FOR SELECT
USING (staff_user_id = auth.uid());

CREATE POLICY "Clients can view their own addons"
ON public.subscription_addons FOR SELECT
USING (client_id = auth.uid());

-- Create function to update subscription totals when addons change
CREATE OR REPLACE FUNCTION public.update_subscription_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_base_price NUMERIC;
  v_addons_total NUMERIC;
BEGIN
  -- Get base price from service
  SELECT COALESCE(sub.base_price_kwd, s.price_kwd) INTO v_base_price
  FROM public.subscriptions sub
  JOIN public.services s ON sub.service_id = s.id
  WHERE sub.id = COALESCE(NEW.subscription_id, OLD.subscription_id);
  
  -- Calculate addons total
  SELECT COALESCE(SUM(price_kwd), 0) INTO v_addons_total
  FROM public.subscription_addons
  WHERE subscription_id = COALESCE(NEW.subscription_id, OLD.subscription_id)
    AND status = 'active'
    AND billing_type = 'recurring';
  
  -- Update subscription totals
  UPDATE public.subscriptions
  SET 
    addons_total_kwd = v_addons_total,
    total_price_kwd = v_base_price + v_addons_total,
    updated_at = now()
  WHERE id = COALESCE(NEW.subscription_id, OLD.subscription_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to update totals on addon changes
CREATE TRIGGER update_subscription_totals_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.subscription_addons
FOR EACH ROW EXECUTE FUNCTION public.update_subscription_totals();

-- Add trigger to update updated_at
CREATE TRIGGER update_addon_catalog_updated_at
BEFORE UPDATE ON public.addon_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_subscription_addons_updated_at
BEFORE UPDATE ON public.subscription_addons
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default addon catalog entries
INSERT INTO public.addon_catalog (specialty, default_name, default_price_kwd, default_payout_kwd) VALUES
('nutrition', 'Nutrition Coaching', 15, 10),
('lifestyle', 'Lifestyle Coaching', 12, 8),
('bodybuilding', 'Bodybuilding Specialist', 15, 10),
('powerlifting', 'Powerlifting Specialist', 15, 10),
('running', 'Running Coach', 12, 8),
('calisthenics', 'Calisthenics Coach', 12, 8),
('mobility', 'Mobility Specialist', 10, 7),
('physiotherapy', 'Physiotherapy Support', 20, 15);
