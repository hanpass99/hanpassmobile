DROP POLICY IF EXISTS customers_insert ON public.customers;

CREATE POLICY customers_insert ON public.customers
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    pool <> 'new_signup'::public.customer_pool
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.can_access_new_signup(auth.uid())
  )
);