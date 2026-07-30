DROP POLICY IF EXISTS customers_read ON public.customers;
CREATE POLICY customers_read ON public.customers FOR SELECT TO authenticated
USING (
  ((select public.has_role(auth.uid(),'admin'::app_role)) OR assigned_to = (select auth.uid())
    OR (country_id IS NOT NULL AND country_id = ANY ((select public.current_user_countries())::uuid[])))
  AND (pool <> 'new_signup'::customer_pool
    OR (select public.has_role(auth.uid(),'admin'::app_role))
    OR (select public.can_access_new_signup(auth.uid())))
);

DROP POLICY IF EXISTS customers_update_staff ON public.customers;
CREATE POLICY customers_update_staff ON public.customers FOR UPDATE TO authenticated
USING (
  (select auth.uid()) IS NOT NULL
  AND ((select public.has_role(auth.uid(),'admin'::app_role)) OR assigned_to = (select auth.uid())
    OR (country_id IS NOT NULL AND country_id = ANY ((select public.current_user_countries())::uuid[])))
  AND (pool <> 'new_signup'::customer_pool
    OR (select public.has_role(auth.uid(),'admin'::app_role))
    OR (select public.can_access_new_signup(auth.uid())))
);

DROP POLICY IF EXISTS customers_delete_admin ON public.customers;
CREATE POLICY customers_delete_admin ON public.customers FOR DELETE TO authenticated
USING ((select public.has_role(auth.uid(),'admin'::app_role)));

DROP POLICY IF EXISTS "status history scoped read" ON public.customer_status_history;
CREATE POLICY "status history scoped read" ON public.customer_status_history FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.customers c
  WHERE c.id = customer_status_history.customer_id
    AND ((select public.has_role(auth.uid(),'admin'::app_role)) OR c.assigned_to = (select auth.uid())
      OR (c.country_id IS NOT NULL AND c.country_id = ANY ((select public.current_user_countries())::uuid[])))
    AND (c.pool <> 'new_signup'::customer_pool
      OR (select public.has_role(auth.uid(),'admin'::app_role))
      OR (select public.can_access_new_signup(auth.uid())))
));

DROP POLICY IF EXISTS call_logs_read ON public.call_logs;
CREATE POLICY call_logs_read ON public.call_logs FOR SELECT TO authenticated
USING (
  (select public.has_role(auth.uid(),'admin'::app_role))
  OR staff_id = (select auth.uid())
  OR EXISTS (SELECT 1 FROM public.customers c
    WHERE c.id = call_logs.customer_id AND c.country_id IS NOT NULL
      AND c.country_id = ANY ((select public.current_user_countries())::uuid[]))
);

DROP POLICY IF EXISTS notes_read ON public.customer_notes;
CREATE POLICY notes_read ON public.customer_notes FOR SELECT TO authenticated
USING (
  (select public.has_role(auth.uid(),'admin'::app_role))
  OR EXISTS (SELECT 1 FROM public.customers c
    WHERE c.id = customer_notes.customer_id
      AND (c.assigned_to = (select auth.uid())
        OR (c.country_id IS NOT NULL AND c.country_id = ANY ((select public.current_user_countries())::uuid[]))))
);

DROP POLICY IF EXISTS call_rounds_read ON public.customer_call_rounds;
CREATE POLICY call_rounds_read ON public.customer_call_rounds FOR SELECT TO authenticated
USING (
  (select public.has_role(auth.uid(),'admin'::app_role))
  OR staff_id = (select auth.uid())
  OR EXISTS (SELECT 1 FROM public.customers c
    WHERE c.id = customer_call_rounds.customer_id
      AND (c.assigned_to = (select auth.uid())
        OR (c.country_id IS NOT NULL AND c.country_id = ANY ((select public.current_user_countries())::uuid[]))))
);

CREATE INDEX IF NOT EXISTS idx_csh_started_status ON public.customer_status_history (started_at, status);
CREATE INDEX IF NOT EXISTS idx_csh_customer_started_desc ON public.customer_status_history (customer_id, started_at DESC);

ANALYZE public.customers;
ANALYZE public.customer_status_history;