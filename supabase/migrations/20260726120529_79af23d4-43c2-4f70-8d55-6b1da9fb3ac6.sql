
ALTER TABLE public.telegram_chats ADD COLUMN IF NOT EXISTS assigned_operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_telegram_chats_assigned_operator ON public.telegram_chats(assigned_operator_id);
