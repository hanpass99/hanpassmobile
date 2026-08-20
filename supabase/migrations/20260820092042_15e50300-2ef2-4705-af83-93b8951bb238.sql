CREATE TABLE public.call_log_ingest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  raw_body jsonb,
  employee_phone text,
  customer_phone text,
  direction text,
  status text,
  duration integer,
  started_at timestamptz,
  parse_ok boolean NOT NULL DEFAULT false,
  error_reason text,
  matched_employee_id uuid,
  matched_customer_id uuid,
  phone_call_log_id uuid
);

CREATE INDEX idx_call_log_ingest_received_at ON public.call_log_ingest (received_at DESC);
CREATE INDEX idx_call_log_ingest_error ON public.call_log_ingest (error_reason) WHERE error_reason IS NOT NULL;

GRANT SELECT, UPDATE ON public.call_log_ingest TO authenticated;
GRANT ALL ON public.call_log_ingest TO service_role;

ALTER TABLE public.call_log_ingest ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view ingest logs" ON public.call_log_ingest
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update ingest logs" ON public.call_log_ingest
FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));