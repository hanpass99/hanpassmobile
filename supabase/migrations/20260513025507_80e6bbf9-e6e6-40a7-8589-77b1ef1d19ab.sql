-- SMS 템플릿
CREATE TABLE public.sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_templates_read" ON public.sms_templates
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_shared = true OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sms_templates_insert_self" ON public.sms_templates
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "sms_templates_update_self" ON public.sms_templates
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sms_templates_delete_self" ON public.sms_templates
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_sms_templates_updated_at
  BEFORE UPDATE ON public.sms_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_sms_templates_user ON public.sms_templates(user_id);

-- SMS 발송 내역
CREATE TABLE public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL,
  customer_id uuid,
  receiver_name text,
  receiver_phone text NOT NULL,
  message text NOT NULL,
  msg_type text NOT NULL DEFAULT 'SMS',
  title text,
  status text NOT NULL DEFAULT 'pending',
  aligo_msg_id text,
  aligo_response jsonb,
  error_message text,
  cost numeric,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_logs_read" ON public.sms_logs
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR staff_id = auth.uid()
    OR (customer_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = sms_logs.customer_id
        AND c.country_id IS NOT NULL
        AND c.country_id = ANY(current_user_countries())
    ))
  );

CREATE POLICY "sms_logs_insert_self" ON public.sms_logs
  FOR INSERT TO authenticated
  WITH CHECK (staff_id = auth.uid());

CREATE POLICY "sms_logs_admin_modify" ON public.sms_logs
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "sms_logs_admin_delete" ON public.sms_logs
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_sms_logs_staff ON public.sms_logs(staff_id);
CREATE INDEX idx_sms_logs_customer ON public.sms_logs(customer_id);
CREATE INDEX idx_sms_logs_sent_at ON public.sms_logs(sent_at DESC);