-- Remove role column from profiles if it exists (from previous migration)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('member', 'coach', 'admin');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Drop existing exercises table if it exists
DROP TABLE IF EXISTS public.exercises CASCADE;

-- Create updated exercises table with new structure
CREATE TABLE public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  muscle_groups text[] NOT NULL,
  muscle_subdivisions jsonb DEFAULT '{}',
  difficulty text NOT NULL CHECK (difficulty IN ('Beginner', 'Intermediate', 'Advanced')),
  youtube_url text,
  setup_instructions text[],
  execution_instructions text[],
  pitfalls text[],
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

-- Policies for exercises
CREATE POLICY "Anyone authenticated can view exercises"
  ON public.exercises
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Coaches and admins can insert exercises"
  ON public.exercises
  FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'coach') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches and admins can update exercises"
  ON public.exercises
  FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'coach') OR 
    public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Coaches and admins can delete exercises"
  ON public.exercises
  FOR DELETE
  USING (
    public.has_role(auth.uid(), 'coach') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- Add trigger for updated_at
CREATE TRIGGER update_exercises_updated_at
  BEFORE UPDATE ON public.exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();