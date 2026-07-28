
ALTER TABLE public.telegram_messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id uuid NULL REFERENCES public.telegram_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reply_to_telegram_message_id bigint NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_messages_reply_to ON public.telegram_messages(reply_to_message_id);
