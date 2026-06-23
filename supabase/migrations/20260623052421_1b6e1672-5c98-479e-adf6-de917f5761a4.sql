
-- Fix 1: merge customers_update_assigned into customers_update_staff (drop redundant permissive policy)
DROP POLICY IF EXISTS customers_update_assigned ON public.customers;

-- Fix 2: restrict friend_referrals reads to admins or users whose scoped countries include the row's country_code
DROP POLICY IF EXISTS "Authenticated can view friend referrals" ON public.friend_referrals;

CREATE POLICY "friend_referrals_read_scoped"
ON public.friend_referrals
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.countries co
    WHERE co.code = friend_referrals.country_code
      AND co.id = ANY (public.current_user_countries())
  )
);
