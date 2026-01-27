-- Update client-documents bucket to allow images
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/webp'
]
WHERE id = 'client-documents';

-- Update coach-documents bucket to allow images (if it exists)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png', 
  'image/webp'
]
WHERE id = 'coach-documents';