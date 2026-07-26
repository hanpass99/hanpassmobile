
CREATE TABLE public.business_hours (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  singleton BOOLEAN NOT NULL DEFAULT true UNIQUE,
  start_hour SMALLINT NOT NULL DEFAULT 10,
  end_hour SMALLINT NOT NULL DEFAULT 19,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  auto_reply_uz TEXT NOT NULL DEFAULT 'Assalomu alaykum! Hozir ish vaqtimiz emas. 🕙 Ish vaqtimiz: har kuni 10:00–19:00 (Koreya vaqti). Xabaringizni qoldiring, operatorlarimiz ish vaqti boshlanishi bilan siz bilan bog''lanadi. Rahmat!',
  auto_reply_ru TEXT NOT NULL DEFAULT 'Здравствуйте! Сейчас нерабочее время. 🕙 Часы работы: ежедневно 10:00–19:00 (по корейскому времени). Оставьте сообщение, и наши операторы свяжутся с вами в начале рабочего дня. Спасибо!',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.business_hours TO authenticated;
GRANT ALL ON public.business_hours TO service_role;

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view business hours"
ON public.business_hours FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can update business hours"
ON public.business_hours FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.business_hours (singleton) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.telegram_chats
  ADD COLUMN IF NOT EXISTS last_off_hours_auto_reply_at TIMESTAMPTZ;
