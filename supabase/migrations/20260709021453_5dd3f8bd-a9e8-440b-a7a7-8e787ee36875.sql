DROP POLICY IF EXISTS sla_audit_select_all_auth ON public.sla_audit_log;
CREATE POLICY sla_audit_select_admin ON public.sla_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS sla_adj_select_all_auth ON public.sla_fine_adjustments;
CREATE POLICY sla_adj_select_admin ON public.sla_fine_adjustments FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));