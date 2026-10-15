CREATE TABLE public.loan_borrowers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  nationality TEXT NOT NULL,
  loan_start_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX loan_borrowers_nationality_idx ON public.loan_borrowers (nationality);
CREATE INDEX loan_borrowers_loan_start_date_idx ON public.loan_borrowers (loan_start_date);
GRANT SELECT ON public.loan_borrowers TO authenticated;
GRANT ALL ON public.loan_borrowers TO service_role;
ALTER TABLE public.loan_borrowers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read loan borrowers"
ON public.loan_borrowers
FOR SELECT
TO authenticated
USING (true);