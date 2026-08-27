ALTER TABLE public.telegram_chats
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at timestamptz,
  ADD COLUMN IF NOT EXISTS banned_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS banned_reason text;

CREATE INDEX IF NOT EXISTS telegram_chats_banned_idx ON public.telegram_chats (banned) WHERE banned;