
CREATE TABLE public.google_form_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp_raw TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  country_raw TEXT,
  country_id UUID REFERENCES public.countries(id),
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT google_form_submissions_dedupe UNIQUE (timestamp_raw, name, phone)
);

CREATE INDEX idx_gfs_synced_at ON public.google_form_submissions (synced_at DESC);

GRANT SELECT ON public.google_form_submissions TO authenticated;
GRANT ALL ON public.google_form_submissions TO service_role;

ALTER TABLE public.google_form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view form submissions"
  ON public.google_form_submissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage form submissions"
  ON public.google_form_submissions FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
