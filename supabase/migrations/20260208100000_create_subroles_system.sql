-- ============================================================
-- Phase 26: Subroles System - Tables & RLS
-- Creates subrole_definitions and user_subroles tables
-- ============================================================

-- Create subrole status enum
CREATE TYPE public.subrole_status AS ENUM ('pending', 'approved', 'rejected', 'revoked');

-- ============================================================
-- subrole_definitions: admin-managed list of credential types
-- ============================================================
CREATE TABLE public.subrole_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  requires_credentials BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the 5 subroles
INSERT INTO public.subrole_definitions (slug, display_name, description, requires_credentials, sort_order) VALUES
  ('coach', 'Exercise Coach', 'General exercise programming and training supervision', false, 1),
  ('dietitian', 'Dietitian', 'Licensed nutrition professional — can override coach nutrition plans', true, 2),
  ('physiotherapist', 'Physiotherapist', 'Licensed physiotherapist — injury assessment and rehab programming', true, 3),
  ('sports_psychologist', 'Sports Psychologist', 'Licensed sports psychologist — mental performance support', true, 4),
  ('mobility_coach', 'Mobility Coach', 'Specialized mobility and corrective exercise programming', true, 5);

ALTER TABLE public.subrole_definitions ENABLE ROW LEVEL SECURITY;

-- Everyone can read active subrole definitions
CREATE POLICY "Anyone can read active subrole definitions"
  ON public.subrole_definitions FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Admins can manage subrole definitions
CREATE POLICY "Admins can manage subrole definitions"
  ON public.subrole_definitions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER update_subrole_definitions_updated_at
  BEFORE UPDATE ON public.subrole_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- user_subroles: tracks which users hold which subroles
-- ============================================================
CREATE TABLE public.user_subroles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subrole_id UUID NOT NULL REFERENCES public.subrole_definitions(id) ON DELETE CASCADE,
  status public.subrole_status NOT NULL DEFAULT 'pending',
  credential_notes TEXT,
  credential_document_url TEXT,
  admin_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, subrole_id)
);

CREATE INDEX idx_user_subroles_user_id ON public.user_subroles(user_id);
CREATE INDEX idx_user_subroles_status ON public.user_subroles(status);

ALTER TABLE public.user_subroles ENABLE ROW LEVEL SECURITY;

-- Coaches can read their own subroles
CREATE POLICY "Users can read own subroles"
  ON public.user_subroles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Coaches can request subroles (INSERT)
CREATE POLICY "Coaches can request subroles"
  ON public.user_subroles FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.has_role(auth.uid(), 'coach'::app_role)
    AND status = 'pending'
  );

-- Coaches can re-request rejected subroles (UPDATE rejected -> pending)
CREATE POLICY "Coaches can re-request rejected subroles"
  ON public.user_subroles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'rejected')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Admins can read all subroles
CREATE POLICY "Admins can read all subroles"
  ON public.user_subroles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Admins can manage all subroles
CREATE POLICY "Admins can manage subroles"
  ON public.user_subroles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
CREATE TRIGGER update_user_subroles_updated_at
  BEFORE UPDATE ON public.user_subroles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
