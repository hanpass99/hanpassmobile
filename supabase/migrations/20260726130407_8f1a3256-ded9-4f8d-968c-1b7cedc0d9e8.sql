ALTER TABLE public.quick_reply_templates ADD COLUMN IF NOT EXISTS shortcut TEXT;
CREATE INDEX IF NOT EXISTS quick_reply_templates_operator_shortcut_idx
  ON public.quick_reply_templates (operator_id, shortcut);