
CREATE TABLE public.pending_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_phone text NOT NULL,
  target_phone text NOT NULL,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pending_calls_lookup ON public.pending_calls (employee_phone, consumed_at, created_at);

GRANT SELECT, INSERT, UPDATE ON public.pending_calls TO authenticated;
GRANT ALL ON public.pending_calls TO service_role;

ALTER TABLE public.pending_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin read" ON public.pending_calls
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own insert" ON public.pending_calls
  FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid());
