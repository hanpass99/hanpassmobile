ALTER TABLE public.telegram_chats ADD COLUMN IF NOT EXISTS operator_typing_at timestamptz;

CREATE TABLE IF NOT EXISTS public.ai_learning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  window_from timestamptz,
  window_to timestamptz,
  pairs_analyzed integer NOT NULL DEFAULT 0,
  candidates integer NOT NULL DEFAULT 0,
  faqs_added integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  error text,
  trigger_source text NOT NULL DEFAULT 'cron'
);

GRANT SELECT ON public.ai_learning_runs TO authenticated;
GRANT ALL ON public.ai_learning_runs TO service_role;
ALTER TABLE public.ai_learning_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view learning runs" ON public.ai_learning_runs
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.ai_faq_entries ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual';