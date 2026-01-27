-- Add qualifications and bio fields to coaches table
ALTER TABLE public.coaches 
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS qualifications TEXT[],
ADD COLUMN IF NOT EXISTS specializations TEXT[];

-- Create policy for public viewing of coach profiles
CREATE POLICY "Anyone can view coach profiles publicly"
ON public.coaches
FOR SELECT
USING (true);