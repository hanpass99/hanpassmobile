
ALTER TABLE public.phone_call_logs
  ADD COLUMN IF NOT EXISTS call_status public.customer_status,
  ADD COLUMN IF NOT EXISTS memo text;

DROP POLICY IF EXISTS "Staff can update own phone call logs" ON public.phone_call_logs;
CREATE POLICY "Staff can update own phone call logs"
  ON public.phone_call_logs FOR UPDATE
  TO authenticated
  USING (staff_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (staff_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER TABLE public.phone_call_logs REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.phone_call_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
