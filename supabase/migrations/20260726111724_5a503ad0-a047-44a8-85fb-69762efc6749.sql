
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.telegram_chats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT NOT NULL UNIQUE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  telegram_user_id BIGINT,
  telegram_username TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  last_message_preview TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER NOT NULL DEFAULT 0,
  is_matched BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.telegram_chats TO authenticated;
GRANT ALL ON public.telegram_chats TO service_role;
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_chats_select" ON public.telegram_chats FOR SELECT TO authenticated USING (true);
CREATE POLICY "tg_chats_update" ON public.telegram_chats FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tg_chats_delete_admin" ON public.telegram_chats FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_telegram_chats_last_message_at ON public.telegram_chats (last_message_at DESC NULLS LAST);
CREATE INDEX idx_telegram_chats_customer_id ON public.telegram_chats (customer_id);
CREATE TRIGGER trg_telegram_chats_updated_at BEFORE UPDATE ON public.telegram_chats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.telegram_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  telegram_chat_row_id UUID NOT NULL REFERENCES public.telegram_chats(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  telegram_message_id BIGINT,
  text TEXT,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (chat_id, telegram_message_id)
);
GRANT SELECT, INSERT ON public.telegram_messages TO authenticated;
GRANT ALL ON public.telegram_messages TO service_role;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_msgs_select" ON public.telegram_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "tg_msgs_insert_out" ON public.telegram_messages FOR INSERT TO authenticated WITH CHECK (direction = 'out' AND sent_by = auth.uid());
CREATE POLICY "tg_msgs_delete_admin" ON public.telegram_messages FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_telegram_messages_chat_row ON public.telegram_messages (telegram_chat_row_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_chats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.telegram_messages;
ALTER TABLE public.telegram_chats REPLICA IDENTITY FULL;
ALTER TABLE public.telegram_messages REPLICA IDENTITY FULL;
