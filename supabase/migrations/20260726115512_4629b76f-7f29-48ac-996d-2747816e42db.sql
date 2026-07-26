
CREATE OR REPLACE FUNCTION public.set_updated_at_ts()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE IF NOT EXISTS public.quick_reply_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_reply_templates TO authenticated;
GRANT ALL ON public.quick_reply_templates TO service_role;

ALTER TABLE public.quick_reply_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own templates select" ON public.quick_reply_templates;
DROP POLICY IF EXISTS "own templates insert" ON public.quick_reply_templates;
DROP POLICY IF EXISTS "own templates update" ON public.quick_reply_templates;
DROP POLICY IF EXISTS "own templates delete" ON public.quick_reply_templates;

CREATE POLICY "own templates select" ON public.quick_reply_templates
  FOR SELECT TO authenticated USING (auth.uid() = operator_id);
CREATE POLICY "own templates insert" ON public.quick_reply_templates
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = operator_id);
CREATE POLICY "own templates update" ON public.quick_reply_templates
  FOR UPDATE TO authenticated USING (auth.uid() = operator_id) WITH CHECK (auth.uid() = operator_id);
CREATE POLICY "own templates delete" ON public.quick_reply_templates
  FOR DELETE TO authenticated USING (auth.uid() = operator_id);

CREATE INDEX IF NOT EXISTS quick_reply_templates_operator_idx
  ON public.quick_reply_templates(operator_id, created_at DESC);

DROP TRIGGER IF EXISTS quick_reply_templates_updated_at ON public.quick_reply_templates;
CREATE TRIGGER quick_reply_templates_updated_at
  BEFORE UPDATE ON public.quick_reply_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_ts();

DO $$ BEGIN
  CREATE TYPE public.telegram_chat_status AS ENUM ('new', 'in_progress', 'done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.telegram_chats
  ADD COLUMN IF NOT EXISTS status public.telegram_chat_status NOT NULL DEFAULT 'new';

CREATE INDEX IF NOT EXISTS telegram_chats_status_idx
  ON public.telegram_chats(status, last_message_at DESC);
