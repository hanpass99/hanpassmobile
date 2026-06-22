
CREATE TABLE public.friend_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_no text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  country_code text,
  channel text,
  signup_ym text,
  signup_date date,
  imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX friend_referrals_member_no_idx ON public.friend_referrals (member_no);
CREATE INDEX friend_referrals_signup_date_idx ON public.friend_referrals (signup_date DESC);
CREATE INDEX friend_referrals_country_code_idx ON public.friend_referrals (country_code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.friend_referrals TO authenticated;
GRANT ALL ON public.friend_referrals TO service_role;

ALTER TABLE public.friend_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view friend referrals"
  ON public.friend_referrals FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "Authenticated can insert friend referrals"
  ON public.friend_referrals FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update friend referrals"
  ON public.friend_referrals FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete friend referrals"
  ON public.friend_referrals FOR DELETE
  TO authenticated USING (true);
