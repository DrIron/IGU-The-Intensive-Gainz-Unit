-- Create coach_client_relationships table for tenure tracking
CREATE TABLE public.coach_client_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  coach_id uuid NOT NULL REFERENCES public.coaches(user_id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('primary', 'care_team')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- FK to profiles_public (the canonical client profile table)
  CONSTRAINT fk_client_profiles_public FOREIGN KEY (client_id) 
    REFERENCES public.profiles_public(id) ON DELETE CASCADE
);

-- Add comment for documentation
COMMENT ON TABLE public.coach_client_relationships IS 
  'Tracks coach-client relationships with tenure dates for time-based access controls. Only active relationships (ended_at IS NULL) grant current access.';

-- Create indexes for performance
CREATE INDEX idx_ccr_client_coach ON public.coach_client_relationships(client_id, coach_id);
CREATE INDEX idx_ccr_coach_active ON public.coach_client_relationships(coach_id, ended_at) WHERE ended_at IS NULL;
CREATE INDEX idx_ccr_subscription ON public.coach_client_relationships(subscription_id);
CREATE INDEX idx_ccr_client_active ON public.coach_client_relationships(client_id) WHERE ended_at IS NULL;

-- Partial unique constraint: only one active primary relationship per client
CREATE UNIQUE INDEX idx_ccr_one_active_primary 
  ON public.coach_client_relationships(client_id) 
  WHERE role = 'primary' AND ended_at IS NULL;

-- Auto-update updated_at trigger
CREATE TRIGGER update_coach_client_relationships_updated_at
  BEFORE UPDATE ON public.coach_client_relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.coach_client_relationships ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins: full access
CREATE POLICY "Admins can manage all relationships"
  ON public.coach_client_relationships
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Coaches: can view their own relationships
CREATE POLICY "Coaches can view their relationships"
  ON public.coach_client_relationships
  FOR SELECT
  TO authenticated
  USING (coach_id = auth.uid());

-- Clients: can view their own relationships
CREATE POLICY "Clients can view their relationships"
  ON public.coach_client_relationships
  FOR SELECT
  TO authenticated
  USING (client_id = auth.uid());

-- Create helper function to check if coach has active relationship with client
CREATE OR REPLACE FUNCTION public.has_active_coach_relationship(
  p_coach_uid uuid, 
  p_client_uid uuid,
  p_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_client_relationships
    WHERE coach_id = p_coach_uid
      AND client_id = p_client_uid
      AND ended_at IS NULL
      AND (p_role IS NULL OR role = p_role)
  )
$$;

-- Create function to get relationship tenure for a coach-client pair
CREATE OR REPLACE FUNCTION public.get_coach_client_tenure(
  p_coach_uid uuid,
  p_client_uid uuid
)
RETURNS TABLE (
  relationship_id uuid,
  role text,
  started_at timestamptz,
  ended_at timestamptz,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id as relationship_id,
    role,
    started_at,
    ended_at,
    (ended_at IS NULL) as is_active
  FROM public.coach_client_relationships
  WHERE coach_id = p_coach_uid
    AND client_id = p_client_uid
  ORDER BY started_at DESC
$$;