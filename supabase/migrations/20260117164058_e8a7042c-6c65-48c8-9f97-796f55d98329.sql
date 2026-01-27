-- STEP 1: Add missing sensitive fields to coach_contacts table
ALTER TABLE public.coach_contacts
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS instagram_url text,
  ADD COLUMN IF NOT EXISTS tiktok_url text,
  ADD COLUMN IF NOT EXISTS snapchat_url text,
  ADD COLUMN IF NOT EXISTS youtube_url text;

-- STEP 2: Migrate existing sensitive data from coaches to coach_contacts
UPDATE public.coach_contacts cc
SET 
  date_of_birth = c.date_of_birth,
  instagram_url = c.instagram_url,
  tiktok_url = c.tiktok_url,
  snapchat_url = c.snapchat_url,
  youtube_url = c.youtube_url
FROM public.coaches c
WHERE cc.coach_id = c.id;

-- STEP 3: Insert any missing coach_contacts records for coaches that don't have one
INSERT INTO public.coach_contacts (coach_id, email, whatsapp_number, date_of_birth, instagram_url, tiktok_url, snapchat_url, youtube_url)
SELECT 
  c.id,
  c.email,
  c.whatsapp_number,
  c.date_of_birth,
  c.instagram_url,
  c.tiktok_url,
  c.snapchat_url,
  c.youtube_url
FROM public.coaches c
WHERE NOT EXISTS (
  SELECT 1 FROM public.coach_contacts cc WHERE cc.coach_id = c.id
);

-- STEP 4: Drop sensitive columns from coaches table
ALTER TABLE public.coaches 
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS whatsapp_number,
  DROP COLUMN IF EXISTS date_of_birth,
  DROP COLUMN IF EXISTS instagram_url,
  DROP COLUMN IF EXISTS tiktok_url,
  DROP COLUMN IF EXISTS snapchat_url,
  DROP COLUMN IF EXISTS youtube_url;

-- STEP 5: Update coach_contacts RLS to allow coaches to update social links
DROP POLICY IF EXISTS "Coaches can update their own contacts" ON public.coach_contacts;
CREATE POLICY "Coaches can update their own contacts"
  ON public.coach_contacts
  FOR UPDATE
  USING (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()))
  WITH CHECK (coach_id IN (SELECT id FROM coaches WHERE user_id = auth.uid()));

-- STEP 6: Add comment for documentation
COMMENT ON TABLE public.coach_contacts IS 'Stores sensitive coach data: contact info, DOB, and social links. Protected by RLS - only accessible by admins, the coach themselves, and active clients of that coach.';