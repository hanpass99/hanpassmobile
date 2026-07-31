ALTER TABLE public.telegram_chats
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS opt_in_date timestamptz,
  ADD COLUMN IF NOT EXISTS marketing_opt_in_asked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_telegram_chats_marketing_opt_in
  ON public.telegram_chats (marketing_opt_in) WHERE marketing_opt_in = true;

CREATE TABLE IF NOT EXISTS public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NOT NULL DEFAULT '',
  lang_filter text NOT NULL DEFAULT 'all',
  media_storage_path text,
  media_file_name text,
  media_mime text,
  media_kind text,
  target_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view broadcasts" ON public.broadcasts
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins can create broadcasts" ON public.broadcasts
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) AND sender_id = auth.uid());
CREATE POLICY "Admins can update broadcasts" ON public.broadcasts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_broadcasts_updated_at
  BEFORE UPDATE ON public.broadcasts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();