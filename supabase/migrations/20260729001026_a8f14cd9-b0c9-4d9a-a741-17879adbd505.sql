GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_reply_settings TO authenticated;
GRANT ALL ON public.ai_reply_settings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_faq_entries TO authenticated;
GRANT ALL ON public.ai_faq_entries TO service_role;
GRANT SELECT ON public.ai_reply_logs TO authenticated;
GRANT ALL ON public.ai_reply_logs TO service_role;
UPDATE public.ai_reply_settings SET enabled = true WHERE scope = 'global';