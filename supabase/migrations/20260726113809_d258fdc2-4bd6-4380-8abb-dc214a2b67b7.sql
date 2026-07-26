CREATE POLICY "Authenticated can read telegram-media"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'telegram-media');