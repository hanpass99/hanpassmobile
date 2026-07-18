
-- Add phone number field to profiles for matching call logs to staff
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_unique ON public.profiles (phone) WHERE phone IS NOT NULL;

-- Raw call logs ingested from Automate app on staff phones
CREATE TABLE IF NOT EXISTS public.phone_call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  employee_phone TEXT NOT NULL,
  customer_phone TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('incoming','outgoing','missed')),
  status TEXT,
  duration_sec INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.phone_call_logs TO authenticated;
GRANT ALL ON public.phone_call_logs TO service_role;

ALTER TABLE public.phone_call_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all phone call logs"
  ON public.phone_call_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Staff can view own phone call logs"
  ON public.phone_call_logs FOR SELECT
  TO authenticated
  USING (staff_id = auth.uid());

CREATE INDEX IF NOT EXISTS phone_call_logs_staff_started_idx
  ON public.phone_call_logs (staff_id, started_at DESC);
CREATE INDEX IF NOT EXISTS phone_call_logs_customer_idx
  ON public.phone_call_logs (customer_id);
