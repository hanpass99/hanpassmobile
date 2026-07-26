
CREATE TABLE public.admin_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.admin_notification_recipients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES public.admin_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ,
  sms_status TEXT,
  sms_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(notification_id, user_id)
);

GRANT SELECT, INSERT ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.admin_notification_recipients TO authenticated;
GRANT ALL ON public.admin_notification_recipients TO service_role;

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins insert notifications"
  ON public.admin_notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins view notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Recipients view their notifications"
  ON public.admin_notifications FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.admin_notification_recipients r
    WHERE r.notification_id = admin_notifications.id AND r.user_id = auth.uid()
  ));

CREATE POLICY "Admins manage all recipients"
  ON public.admin_notification_recipients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view own recipient rows"
  ON public.admin_notification_recipients FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users acknowledge own rows"
  ON public.admin_notification_recipients FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_anr_user_pending ON public.admin_notification_recipients(user_id) WHERE acknowledged_at IS NULL;

ALTER TABLE public.admin_notification_recipients REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notification_recipients;
ALTER TABLE public.admin_notifications REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
