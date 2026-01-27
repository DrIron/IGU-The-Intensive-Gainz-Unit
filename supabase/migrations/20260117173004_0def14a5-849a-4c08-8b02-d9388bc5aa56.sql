-- ============================================================
-- PROFILES SPLIT: profiles_public + profiles_private
-- Coaches only see profiles_public, no PII access
-- Complete migration in one transaction
-- ============================================================

-- Step 1: Create profiles_public (non-sensitive data for coaching)
CREATE TABLE public.profiles_public (
  id uuid NOT NULL PRIMARY KEY,
  display_name text,
  first_name text,
  avatar_url text,
  status public.account_status DEFAULT 'pending'::public.account_status,
  payment_exempt boolean NOT NULL DEFAULT false,
  payment_deadline timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  signup_completed_at timestamp with time zone,
  onboarding_completed_at timestamp with time zone,
  activation_completed_at timestamp with time zone
);

-- Step 2: Create profiles_private (sensitive PII/health data)
CREATE TABLE public.profiles_private (
  profile_id uuid NOT NULL PRIMARY KEY REFERENCES public.profiles_public(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  last_name text,
  phone text,
  date_of_birth date,
  gender text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Step 3: Create client_coach_notes for coach-visible notes about clients
CREATE TABLE public.client_coach_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.profiles_public(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL,
  notes text,
  injury_summary text,
  flags jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX idx_client_coach_notes_unique ON public.client_coach_notes(client_id, coach_id);

-- Step 4: Migrate data from profiles to the new tables
INSERT INTO public.profiles_public (
  id, display_name, first_name, avatar_url, status, payment_exempt,
  payment_deadline, created_at, updated_at, signup_completed_at,
  onboarding_completed_at, activation_completed_at
)
SELECT 
  id,
  COALESCE(first_name, split_part(COALESCE(full_name, ''), ' ', 1)) as display_name,
  first_name,
  NULL as avatar_url,
  status,
  payment_exempt,
  payment_deadline,
  created_at,
  updated_at,
  signup_completed_at,
  onboarding_completed_at,
  activation_completed_at
FROM public.profiles;

INSERT INTO public.profiles_private (
  profile_id, email, full_name, last_name, phone, date_of_birth, gender, created_at, updated_at
)
SELECT 
  id as profile_id,
  email,
  full_name,
  last_name,
  phone,
  date_of_birth,
  gender,
  created_at,
  updated_at
FROM public.profiles;

-- Step 5: Enable RLS on new tables
ALTER TABLE public.profiles_public ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_coach_notes ENABLE ROW LEVEL SECURITY;

-- Step 6: RLS Policies for profiles_public
CREATE POLICY "Users can view own profiles_public"
  ON public.profiles_public FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profiles_public"
  ON public.profiles_public FOR UPDATE
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Coaches can view assigned client profiles_public"
  ON public.profiles_public FOR SELECT
  USING (
    public.has_role(auth.uid(), 'coach'::public.app_role) AND
    EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = profiles_public.id AND s.coach_id = auth.uid())
  );

CREATE POLICY "Admins can view all profiles_public"
  ON public.profiles_public FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update all profiles_public"
  ON public.profiles_public FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert profiles_public"
  ON public.profiles_public FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR auth.uid() = id);

-- Step 7: RLS Policies for profiles_private (STRICT - Coaches CANNOT read)
CREATE POLICY "Users can view own profiles_private"
  ON public.profiles_private FOR SELECT
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can update own profiles_private"
  ON public.profiles_private FOR UPDATE
  USING (auth.uid() = profile_id) WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Admins can view all profiles_private"
  ON public.profiles_private FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update all profiles_private"
  ON public.profiles_private FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can insert profiles_private"
  ON public.profiles_private FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR auth.uid() = profile_id);

-- Step 8: RLS Policies for client_coach_notes
CREATE POLICY "Coach can view own client notes"
  ON public.client_coach_notes FOR SELECT
  USING (auth.uid() = coach_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Coach can insert own client notes"
  ON public.client_coach_notes FOR INSERT
  WITH CHECK (
    (auth.uid() = coach_id AND EXISTS (
      SELECT 1 FROM public.subscriptions s WHERE s.user_id = client_id AND s.coach_id = auth.uid()
    )) OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "Coach can update own client notes"
  ON public.client_coach_notes FOR UPDATE
  USING (auth.uid() = coach_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = coach_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Coach can delete own client notes"
  ON public.client_coach_notes FOR DELETE
  USING (auth.uid() = coach_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Step 9: Rename old profiles table to profiles_legacy
ALTER TABLE public.profiles RENAME TO profiles_legacy;

-- Step 10: Create compatibility view
CREATE VIEW public.profiles AS
SELECT 
  pp.id, priv.email, priv.full_name, priv.phone, pp.status, pp.created_at, pp.updated_at,
  pp.payment_deadline, pp.signup_completed_at, pp.onboarding_completed_at, pp.activation_completed_at,
  pp.first_name, priv.last_name, priv.date_of_birth, priv.gender, pp.payment_exempt, pp.display_name, pp.avatar_url
FROM public.profiles_public pp
LEFT JOIN public.profiles_private priv ON pp.id = priv.profile_id;

-- Step 11: Create INSTEAD OF triggers for the view
CREATE OR REPLACE FUNCTION public.profiles_view_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles_public (id, display_name, first_name, avatar_url, status, payment_exempt,
    payment_deadline, created_at, updated_at, signup_completed_at, onboarding_completed_at, activation_completed_at)
  VALUES (NEW.id, COALESCE(NEW.display_name, NEW.first_name, split_part(COALESCE(NEW.full_name, ''), ' ', 1)),
    NEW.first_name, NEW.avatar_url, COALESCE(NEW.status, 'pending'::public.account_status),
    COALESCE(NEW.payment_exempt, false), NEW.payment_deadline, COALESCE(NEW.created_at, now()),
    COALESCE(NEW.updated_at, now()), NEW.signup_completed_at, NEW.onboarding_completed_at, NEW.activation_completed_at);
  
  INSERT INTO public.profiles_private (profile_id, email, full_name, last_name, phone, date_of_birth, gender, created_at, updated_at)
  VALUES (NEW.id, NEW.email, NEW.full_name, NEW.last_name, NEW.phone, NEW.date_of_birth, NEW.gender,
    COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()));
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.profiles_view_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles_public SET
    display_name = COALESCE(NEW.display_name, NEW.first_name, split_part(COALESCE(NEW.full_name, ''), ' ', 1)),
    first_name = NEW.first_name, avatar_url = NEW.avatar_url, status = NEW.status,
    payment_exempt = NEW.payment_exempt, payment_deadline = NEW.payment_deadline, updated_at = now(),
    signup_completed_at = NEW.signup_completed_at, onboarding_completed_at = NEW.onboarding_completed_at,
    activation_completed_at = NEW.activation_completed_at
  WHERE id = OLD.id;
  
  UPDATE public.profiles_private SET
    email = NEW.email, full_name = NEW.full_name, last_name = NEW.last_name,
    phone = NEW.phone, date_of_birth = NEW.date_of_birth, gender = NEW.gender, updated_at = now()
  WHERE profile_id = OLD.id;
  RETURN NEW;
END; $$;

CREATE TRIGGER profiles_view_insert_trigger INSTEAD OF INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_view_insert();

CREATE TRIGGER profiles_view_update_trigger INSTEAD OF UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_view_update();

-- Step 12: Update handle_new_user trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles_public (id, first_name, display_name, status)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'pending'::account_status)
  ON CONFLICT (id) DO UPDATE SET
    first_name = COALESCE(NEW.raw_user_meta_data->>'full_name', profiles_public.first_name),
    display_name = COALESCE(NEW.raw_user_meta_data->>'full_name', profiles_public.display_name),
    updated_at = now();

  INSERT INTO public.profiles_private (profile_id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''))
  ON CONFLICT (profile_id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', profiles_private.full_name),
    updated_at = now();
  RETURN NEW;
END; $$;

-- Step 13: Timestamp triggers
CREATE TRIGGER update_profiles_public_updated_at BEFORE UPDATE ON public.profiles_public
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_private_updated_at BEFORE UPDATE ON public.profiles_private
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_coach_notes_updated_at BEFORE UPDATE ON public.client_coach_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Step 14: Comments and grants
COMMENT ON TABLE public.profiles_public IS 'Non-sensitive client profile data visible to coaches and admins';
COMMENT ON TABLE public.profiles_private IS 'Sensitive PII/health data - only client and admin can access, NOT coaches';
COMMENT ON TABLE public.client_coach_notes IS 'Coach notes about clients - only assigned coach and admin can access';
COMMENT ON VIEW public.profiles IS 'Compatibility view joining profiles_public and profiles_private';

GRANT SELECT, INSERT, UPDATE ON public.profiles_public TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles_private TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_coach_notes TO authenticated;
GRANT SELECT ON public.profiles TO authenticated;