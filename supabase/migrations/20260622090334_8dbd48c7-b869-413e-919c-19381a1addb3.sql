
DROP POLICY IF EXISTS "Authenticated can insert friend referrals" ON public.friend_referrals;
DROP POLICY IF EXISTS "Authenticated can update friend referrals" ON public.friend_referrals;
DROP POLICY IF EXISTS "Authenticated can delete friend referrals" ON public.friend_referrals;

CREATE POLICY "Admins can insert friend referrals"
  ON public.friend_referrals FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update friend referrals"
  ON public.friend_referrals FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete friend referrals"
  ON public.friend_referrals FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
