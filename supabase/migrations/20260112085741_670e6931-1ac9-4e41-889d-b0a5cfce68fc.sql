-- ============================================
-- Session Booking System Schema
-- ============================================

-- 1) Extend services table for session-enabled plans
ALTER TABLE public.services
ADD COLUMN IF NOT EXISTS enable_session_booking boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS default_weekly_session_limit integer,
ADD COLUMN IF NOT EXISTS default_session_duration_minutes integer;

-- 2) Extend subscriptions table to hold booking config
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS session_booking_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS weekly_session_limit integer,
ADD COLUMN IF NOT EXISTS session_duration_minutes integer;

-- 3a) Create coach_time_slots table
CREATE TABLE IF NOT EXISTS public.coach_time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot_start timestamptz NOT NULL,
  slot_end timestamptz NOT NULL,
  location text,
  slot_type text NOT NULL DEFAULT 'in_person',
  status text NOT NULL DEFAULT 'available',
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3b) Create session_bookings table
CREATE TABLE IF NOT EXISTS public.session_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.coach_time_slots(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_type text NOT NULL DEFAULT 'in_person',
  session_start timestamptz NOT NULL,
  session_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'booked',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_coach_time_slots_coach_id ON public.coach_time_slots(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_time_slots_status ON public.coach_time_slots(status);
CREATE INDEX IF NOT EXISTS idx_coach_time_slots_slot_start ON public.coach_time_slots(slot_start);
CREATE INDEX IF NOT EXISTS idx_session_bookings_client_id ON public.session_bookings(client_id);
CREATE INDEX IF NOT EXISTS idx_session_bookings_coach_id ON public.session_bookings(coach_id);
CREATE INDEX IF NOT EXISTS idx_session_bookings_subscription_id ON public.session_bookings(subscription_id);
CREATE INDEX IF NOT EXISTS idx_session_bookings_status ON public.session_bookings(status);

-- Create updated_at triggers
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger for coach_time_slots
DROP TRIGGER IF EXISTS update_coach_time_slots_updated_at ON public.coach_time_slots;
CREATE TRIGGER update_coach_time_slots_updated_at
  BEFORE UPDATE ON public.coach_time_slots
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for session_bookings
DROP TRIGGER IF EXISTS update_session_bookings_updated_at ON public.session_bookings;
CREATE TRIGGER update_session_bookings_updated_at
  BEFORE UPDATE ON public.session_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- RLS Policies for coach_time_slots
-- ============================================
ALTER TABLE public.coach_time_slots ENABLE ROW LEVEL SECURITY;

-- Coaches can manage their own slots
CREATE POLICY "Coaches can view their own time slots"
  ON public.coach_time_slots
  FOR SELECT
  USING (coach_id = auth.uid());

CREATE POLICY "Coaches can insert their own time slots"
  ON public.coach_time_slots
  FOR INSERT
  WITH CHECK (coach_id = auth.uid());

CREATE POLICY "Coaches can update their own time slots"
  ON public.coach_time_slots
  FOR UPDATE
  USING (coach_id = auth.uid());

-- Admins have full access
CREATE POLICY "Admins can view all time slots"
  ON public.coach_time_slots
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert time slots"
  ON public.coach_time_slots
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all time slots"
  ON public.coach_time_slots
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete time slots"
  ON public.coach_time_slots
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Clients can view available future slots
CREATE POLICY "Clients can view available future slots"
  ON public.coach_time_slots
  FOR SELECT
  USING (
    status = 'available' 
    AND slot_start > now()
    AND auth.uid() IS NOT NULL
  );

-- ============================================
-- RLS Policies for session_bookings
-- ============================================
ALTER TABLE public.session_bookings ENABLE ROW LEVEL SECURITY;

-- Clients can view their own bookings
CREATE POLICY "Clients can view their own session bookings"
  ON public.session_bookings
  FOR SELECT
  USING (client_id = auth.uid());

-- Coaches can view their bookings
CREATE POLICY "Coaches can view their session bookings"
  ON public.session_bookings
  FOR SELECT
  USING (coach_id = auth.uid());

-- Coaches can update status and notes for their bookings
CREATE POLICY "Coaches can update their session bookings"
  ON public.session_bookings
  FOR UPDATE
  USING (coach_id = auth.uid());

-- Admins have full access
CREATE POLICY "Admins can view all session bookings"
  ON public.session_bookings
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert session bookings"
  ON public.session_bookings
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update all session bookings"
  ON public.session_bookings
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete session bookings"
  ON public.session_bookings
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));