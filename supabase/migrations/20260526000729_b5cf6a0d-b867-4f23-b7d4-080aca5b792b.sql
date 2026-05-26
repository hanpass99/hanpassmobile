
-- 1) Tighten customers INSERT: staff can only create rows assigned to themselves; admins unrestricted
DROP POLICY IF EXISTS customers_insert ON public.customers;
CREATE POLICY customers_insert ON public.customers
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
  )
  AND (
    pool <> 'new_signup'::customer_pool
    OR has_role(auth.uid(), 'admin'::app_role)
    OR can_access_new_signup(auth.uid())
  )
);

-- 2) Tighten customers UPDATE (customers_update_staff): require ownership / country scope / admin
DROP POLICY IF EXISTS customers_update_staff ON public.customers;
CREATE POLICY customers_update_staff ON public.customers
FOR UPDATE TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
    OR (country_id IS NOT NULL AND country_id = ANY (current_user_countries()))
  )
  AND (
    pool <> 'new_signup'::customer_pool
    OR has_role(auth.uid(), 'admin'::app_role)
    OR can_access_new_signup(auth.uid())
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
    OR (country_id IS NOT NULL AND country_id = ANY (current_user_countries()))
  )
  AND (
    pool <> 'new_signup'::customer_pool
    OR has_role(auth.uid(), 'admin'::app_role)
    OR can_access_new_signup(auth.uid())
  )
);
