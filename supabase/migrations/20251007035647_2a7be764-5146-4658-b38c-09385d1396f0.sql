-- Create team plan settings table
CREATE TABLE IF NOT EXISTS public.team_plan_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_registration_open boolean NOT NULL DEFAULT true,
  next_program_start_date timestamp with time zone,
  announcement_text text,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.team_plan_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can view settings
CREATE POLICY "Anyone can view team plan settings"
ON public.team_plan_settings
FOR SELECT
TO authenticated
USING (true);

-- Only admins can update settings
CREATE POLICY "Only admins can update team plan settings"
ON public.team_plan_settings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can insert settings
CREATE POLICY "Only admins can insert team plan settings"
ON public.team_plan_settings
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Insert default settings
INSERT INTO public.team_plan_settings (is_registration_open, announcement_text)
VALUES (true, 'Next team program starts soon!');

-- Create trigger to update updated_at
CREATE TRIGGER update_team_plan_settings_updated_at
BEFORE UPDATE ON public.team_plan_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();