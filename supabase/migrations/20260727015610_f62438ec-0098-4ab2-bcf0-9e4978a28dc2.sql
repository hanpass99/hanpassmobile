
CREATE POLICY "Authenticated can upload telegram-media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'telegram-media');
