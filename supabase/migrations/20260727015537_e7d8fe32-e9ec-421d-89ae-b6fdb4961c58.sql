
ALTER TABLE public.telegram_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE POLICY "tg_msgs_update_own_out"
ON public.telegram_messages
FOR UPDATE
TO authenticated
USING (direction = 'out' AND sent_by = auth.uid())
WITH CHECK (direction = 'out' AND sent_by = auth.uid());
