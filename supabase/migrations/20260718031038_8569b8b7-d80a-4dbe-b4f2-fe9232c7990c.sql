DROP POLICY IF EXISTS "auth read status history" ON public.customer_status_history;

CREATE POLICY "status history scoped read" ON public.customer_status_history
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_status_history.customer_id
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR c.assigned_to = auth.uid()
        OR (c.country_id IS NOT NULL AND c.country_id = ANY (public.current_user_countries()))
      )
      AND (
        c.pool <> 'new_signup'::public.customer_pool
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.can_access_new_signup(auth.uid())
      )
  )
);