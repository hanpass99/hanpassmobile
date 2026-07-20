
CREATE TABLE public.ai_chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool')),
  content TEXT,
  tool_name TEXT,
  tool_input JSONB,
  tool_output JSONB,
  session_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_chat_logs TO authenticated;
GRANT ALL ON public.ai_chat_logs TO service_role;
ALTER TABLE public.ai_chat_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_chat_logs_insert_self" ON public.ai_chat_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ai_chat_logs_select_own_or_admin" ON public.ai_chat_logs
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE INDEX ai_chat_logs_user_created_idx ON public.ai_chat_logs (user_id, created_at DESC);
CREATE INDEX ai_chat_logs_session_idx ON public.ai_chat_logs (session_id, created_at);
