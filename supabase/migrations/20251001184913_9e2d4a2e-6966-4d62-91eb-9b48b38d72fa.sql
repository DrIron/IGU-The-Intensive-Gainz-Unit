-- Create enum for service types
CREATE TYPE service_type AS ENUM ('team', 'one_to_one');

-- Create enum for account status
CREATE TYPE account_status AS ENUM ('pending', 'active', 'suspended');

-- Create services table
CREATE TABLE public.services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type service_type NOT NULL,
  price_kwd DECIMAL(10, 2) NOT NULL,
  description TEXT,
  features TEXT[],
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert the 5 services
INSERT INTO public.services (name, type, price_kwd, description, features) VALUES
  ('Fe Squad', 'team', 12.00, 'Join our female-focused team training program', ARRAY['Group coaching', 'Workout plans', 'Community support', 'Monthly challenges']),
  ('Bunz of Steel', 'team', 12.00, 'Specialized glute and lower body team program', ARRAY['Group coaching', 'Targeted training', 'Community support', 'Progress tracking']),
  ('1:1 Online', 'one_to_one', 50.00, 'Personalized online coaching', ARRAY['Custom workout plans', 'Nutrition guidance', 'Weekly check-ins', '24/7 messaging support']),
  ('1:1 Hybrid', 'one_to_one', 175.00, 'Mix of online and in-person training', ARRAY['Custom programs', 'In-person sessions', 'Online support', 'Nutrition planning', 'Form checks']),
  ('1:1 In-Person', 'one_to_one', 250.00, 'Premium in-person coaching experience', ARRAY['All in-person training', 'Personalized attention', 'Advanced programming', 'Nutrition & lifestyle coaching', 'Priority support']);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  status account_status DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create subscriptions table
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES public.services(id),
  tap_subscription_id TEXT,
  tap_customer_id TEXT,
  status TEXT DEFAULT 'pending',
  start_date TIMESTAMPTZ,
  next_billing_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for services (public read)
CREATE POLICY "Services are viewable by everyone"
  ON public.services FOR SELECT
  USING (is_active = true);

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();