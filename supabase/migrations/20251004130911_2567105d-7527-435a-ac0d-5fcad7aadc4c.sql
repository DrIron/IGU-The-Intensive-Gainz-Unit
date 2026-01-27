-- Create coaches table
CREATE TABLE public.coaches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name text NOT NULL,
  age integer,
  location text,
  email text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;

-- RLS policies for coaches
CREATE POLICY "Admins can view all coaches"
  ON public.coaches
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can view their own profile"
  ON public.coaches
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can insert coaches"
  ON public.coaches
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update coaches"
  ON public.coaches
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Coaches can update their own profile"
  ON public.coaches
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can delete coaches"
  ON public.coaches
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_coaches_updated_at
  BEFORE UPDATE ON public.coaches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();