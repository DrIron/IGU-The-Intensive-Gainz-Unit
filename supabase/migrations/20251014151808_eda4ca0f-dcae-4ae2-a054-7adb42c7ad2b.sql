-- Add is_archived column to testimonials table
ALTER TABLE public.testimonials 
ADD COLUMN is_archived boolean NOT NULL DEFAULT false;