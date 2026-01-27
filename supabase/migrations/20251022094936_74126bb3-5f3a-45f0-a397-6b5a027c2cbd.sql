-- Create a public storage bucket specifically for coach profile pictures
INSERT INTO storage.buckets (id, name, public)
VALUES ('coach-profiles', 'coach-profiles', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for coach-profiles bucket
CREATE POLICY "Anyone can view coach profile pictures"
ON storage.objects FOR SELECT
USING (bucket_id = 'coach-profiles');

CREATE POLICY "Coaches can upload their own profile picture"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'coach-profiles' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Coaches can update their own profile picture"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'coach-profiles' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Coaches can delete their own profile picture"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'coach-profiles' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can manage all coach profile pictures"
ON storage.objects FOR ALL
USING (
  bucket_id = 'coach-profiles'
  AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'::app_role
  )
);