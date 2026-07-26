
CREATE TABLE public.ui_translations (
  source_text text NOT NULL,
  target_lang text NOT NULL,
  translated_text text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_text, target_lang)
);
GRANT SELECT ON public.ui_translations TO authenticated;
GRANT ALL ON public.ui_translations TO service_role;
ALTER TABLE public.ui_translations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read translations" ON public.ui_translations FOR SELECT TO authenticated USING (true);
