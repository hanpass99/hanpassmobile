-- 1. Operator reply training pairs
CREATE TABLE public.ai_training_pairs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_row_id uuid REFERENCES public.telegram_chats(id) ON DELETE CASCADE,
  inbound_message_id uuid,
  outbound_message_id uuid UNIQUE,
  question text NOT NULL,
  answer text NOT NULL,
  language text,
  answered_at timestamptz NOT NULL DEFAULT now(),
  operator_id uuid,
  used_for_candidate boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_training_pairs TO authenticated;
GRANT ALL ON public.ai_training_pairs TO service_role;
ALTER TABLE public.ai_training_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read training pairs" ON public.ai_training_pairs
  FOR SELECT TO authenticated USING (true);

CREATE INDEX idx_ai_training_pairs_answered_at ON public.ai_training_pairs (answered_at DESC);
CREATE INDEX idx_ai_training_pairs_used ON public.ai_training_pairs (used_for_candidate);

-- 2. FAQ candidates
CREATE TABLE public.ai_faq_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text,
  question_examples text[] NOT NULL,
  answer_uz text NOT NULL,
  answer_ru text NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'auto',
  reviewed_by uuid,
  reviewed_at timestamptz,
  promoted_faq_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_faq_candidates TO authenticated;
GRANT ALL ON public.ai_faq_candidates TO service_role;
ALTER TABLE public.ai_faq_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read faq candidates" ON public.ai_faq_candidates
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage faq candidates" ON public.ai_faq_candidates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ai_faq_candidates_updated_at
  BEFORE UPDATE ON public.ai_faq_candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Chat-level AI state
ALTER TABLE public.telegram_chats
  ADD COLUMN IF NOT EXISTS needs_human boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_human_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_human_reason text,
  ADD COLUMN IF NOT EXISTS ai_suggestion text,
  ADD COLUMN IF NOT EXISTS ai_suggestion_confidence numeric,
  ADD COLUMN IF NOT EXISTS ai_suggestion_at timestamptz;

-- 4. Auto-collect operator replies into training pairs
CREATE OR REPLACE FUNCTION public.collect_ai_training_pair()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_question text;
  prev_id uuid;
  chat_lang text;
BEGIN
  IF NEW.direction <> 'out' OR NEW.is_ai_generated OR NEW.sent_by IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.text IS NULL OR length(btrim(NEW.text)) < 5 THEN
    RETURN NEW;
  END IF;

  SELECT m.id, m.text INTO prev_id, prev_question
  FROM public.telegram_messages m
  WHERE m.telegram_chat_row_id = NEW.telegram_chat_row_id
    AND m.direction = 'in'
    AND m.text IS NOT NULL
    AND m.created_at < NEW.created_at
  ORDER BY m.created_at DESC
  LIMIT 1;

  IF prev_question IS NULL OR length(btrim(prev_question)) < 5 THEN
    RETURN NEW;
  END IF;

  SELECT c.language INTO chat_lang FROM public.telegram_chats c WHERE c.id = NEW.telegram_chat_row_id;

  INSERT INTO public.ai_training_pairs (
    chat_row_id, inbound_message_id, outbound_message_id, question, answer, language, answered_at, operator_id
  ) VALUES (
    NEW.telegram_chat_row_id, prev_id, NEW.id, btrim(prev_question), btrim(NEW.text), chat_lang, NEW.created_at, NEW.sent_by
  )
  ON CONFLICT (outbound_message_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_collect_ai_training_pair
  AFTER INSERT ON public.telegram_messages
  FOR EACH ROW EXECUTE FUNCTION public.collect_ai_training_pair();