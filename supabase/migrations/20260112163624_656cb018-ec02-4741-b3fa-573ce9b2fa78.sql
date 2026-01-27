-- Create service_billing_components table for price breakdown display
CREATE TABLE public.service_billing_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  label text NOT NULL,
  component_type text NOT NULL CHECK (component_type IN ('base', 'add_on')),
  module_key text,
  amount_kwd numeric NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for efficient lookups by service
CREATE INDEX idx_service_billing_components_service_id ON public.service_billing_components(service_id);

-- Enable RLS
ALTER TABLE public.service_billing_components ENABLE ROW LEVEL SECURITY;

-- Admins can manage billing components
CREATE POLICY "Admins can manage billing components"
ON public.service_billing_components
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Anyone authenticated can view billing components (for display purposes)
CREATE POLICY "Authenticated users can view billing components"
ON public.service_billing_components
FOR SELECT
TO authenticated
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_service_billing_components_updated_at
BEFORE UPDATE ON public.service_billing_components
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();