-- Add agreed_intellectual_property column to form_submissions
ALTER TABLE public.form_submissions
ADD COLUMN agreed_intellectual_property BOOLEAN NOT NULL DEFAULT false;