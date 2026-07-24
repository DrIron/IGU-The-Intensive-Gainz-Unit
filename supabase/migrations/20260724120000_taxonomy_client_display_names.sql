-- Client-facing display names as DATA on the muscle taxonomy.
-- Convention: NULL = fall back to display_name; '' (empty string) = suppress on client surfaces.
ALTER TABLE public.muscles ADD COLUMN IF NOT EXISTS client_display_name text;
ALTER TABLE public.muscle_subdivisions ADD COLUMN IF NOT EXISTS client_display_name text;

COMMENT ON COLUMN public.muscles.client_display_name IS 'Client-facing muscle title. NULL = fall back to display_name; empty string = suppress (no muscle title, e.g. Systemic/Powerlifting).';
COMMENT ON COLUMN public.muscle_subdivisions.client_display_name IS 'Client-facing focus label. NULL = fall back to display_name; empty string = suppress the focus indicator.';

UPDATE public.muscles m SET client_display_name = v.label
FROM (VALUES
  ('Pec Major','Pecs'),
  ('Deltoids','Delts'),
  ('Upper/Mid Back','Back'),
  ('Elbow Flexors','Biceps'),
  ('Serratus Anterior','Serratus'),
  ('Rectus Abdominis','Abs'),
  ('Systemic',''),
  ('Powerlifting','')
) v(display_name, label)
WHERE m.display_name = v.display_name AND m.client_display_name IS NULL;

UPDATE public.muscle_subdivisions ms SET client_display_name = v.label
FROM public.muscles m, (VALUES
  ('Pec Major','Clavicular Head','Upper Pec'),
  ('Pec Major','Sternal Head','Mid Pec'),
  ('Pec Major','Costal Head','Lower Pec'),
  ('Deltoids','Anterior','Front Delts'),
  ('Deltoids','Lateral','Lateral Delts'),
  ('Deltoids','Posterior','Posterior Delts'),
  ('Lats','Thoracic','Upper Lats'),
  ('Lats','Lumbar','Mid Lats'),
  ('Lats','Iliac','Lower Lats'),
  ('Upper Back','Upper Trapezius','Upper Traps'),
  ('Mid Back','Mid Trapezius','Mid Traps'),
  ('Mid Back','Lower Trapezius','Lower Traps'),
  ('Upper/Mid Back','Compound',''),
  ('Elbow Flexors','Biceps',''),
  ('Elbow Flexors','Biceps Long Head','Long Head'),
  ('Elbow Flexors','Biceps Short Head','Short Head'),
  ('Triceps','Lateral & Medial Head',''),
  ('Triceps','Long Head','Long Head'),
  ('Glutes','Gluteus Maximus','Glute Max'),
  ('Glutes','Gluteus Medius','Glute Med'),
  ('Glutes','Gluteus Minimus','Glute Min'),
  ('Abs','Rectus Abdominis',''),
  ('Core','TVA',''),
  ('Lower Back','Spinal Erectors','')
) v(muscle, subdivision, label)
WHERE ms.muscle_id = m.id AND m.display_name = v.muscle
  AND ms.display_name = v.subdivision AND ms.client_display_name IS NULL;
