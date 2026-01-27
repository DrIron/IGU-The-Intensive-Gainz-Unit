-- Add protein calculation method to nutrition_goals table
ALTER TABLE public.nutrition_goals
ADD COLUMN protein_based_on_ffm boolean DEFAULT false;