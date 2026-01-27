-- Add coach_id_at_creation column to nutrition_goals
ALTER TABLE public.nutrition_goals 
ADD COLUMN IF NOT EXISTS coach_id_at_creation uuid REFERENCES public.coaches(user_id);

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_nutrition_goals_coach_at_creation 
ON public.nutrition_goals(coach_id_at_creation);

-- Create trigger function to auto-populate coach_id_at_creation on INSERT
CREATE OR REPLACE FUNCTION public.set_nutrition_goal_coach_at_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach_id uuid;
BEGIN
  -- Get the client's current primary coach from active subscription
  SELECT s.coach_id INTO v_coach_id
  FROM public.subscriptions s
  WHERE s.user_id = NEW.user_id
    AND s.status IN ('active', 'pending')
    AND s.coach_id IS NOT NULL
  ORDER BY s.created_at DESC
  LIMIT 1;
  
  -- Set the coach_id_at_creation
  NEW.coach_id_at_creation := v_coach_id;
  
  RETURN NEW;
END;
$$;

-- Create trigger on nutrition_goals INSERT
DROP TRIGGER IF EXISTS trg_set_nutrition_goal_coach ON public.nutrition_goals;
CREATE TRIGGER trg_set_nutrition_goal_coach
BEFORE INSERT ON public.nutrition_goals
FOR EACH ROW
EXECUTE FUNCTION public.set_nutrition_goal_coach_at_creation();

-- Backfill existing nutrition_goals with coach_id from subscriptions
-- Uses the subscription that was active around the time the goal was created
UPDATE public.nutrition_goals ng
SET coach_id_at_creation = (
  SELECT s.coach_id
  FROM public.subscriptions s
  WHERE s.user_id = ng.user_id
    AND s.coach_id IS NOT NULL
    -- Try to find subscription that was active when goal was created
    AND s.created_at <= ng.created_at
  ORDER BY s.created_at DESC
  LIMIT 1
)
WHERE ng.coach_id_at_creation IS NULL;

-- For any remaining nulls, fall back to current coach
UPDATE public.nutrition_goals ng
SET coach_id_at_creation = (
  SELECT s.coach_id
  FROM public.subscriptions s
  WHERE s.user_id = ng.user_id
    AND s.coach_id IS NOT NULL
  ORDER BY s.created_at DESC
  LIMIT 1
)
WHERE ng.coach_id_at_creation IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.nutrition_goals.coach_id_at_creation IS 'The primary coach assigned to the client at the time this nutrition goal was created. Used for tenure-based ownership tracking.';