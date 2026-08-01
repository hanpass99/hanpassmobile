INSERT INTO public.telegram_messages (
  chat_id,
  telegram_chat_row_id,
  direction,
  text,
  sent_by,
  is_ai_generated,
  raw
)
SELECT
  c.chat_id,
  c.id,
  'out',
  CASE
    WHEN c.language = 'ru' THEN 'Спасибо за обращение! ✅ Ваш диалог завершён. Если появятся вопросы, нажмите кнопку ниже или отправьте /start. Всего доброго!'
    ELSE 'Murojaatingiz uchun rahmat! ✅ Suhbatingiz yakunlandi. Agar yana savolingiz bo''lsa, quyidagi tugmani bosing yoki /start yuboring. Sog'' bo''ling!'
  END,
  c.assigned_operator_id,
  false,
  jsonb_build_object('system_event', 'conversation_closed', 'backfilled', true)
FROM public.telegram_chats c
WHERE c.status = 'done'
  AND NOT EXISTS (
    SELECT 1
    FROM public.telegram_messages m
    WHERE m.telegram_chat_row_id = c.id
      AND m.raw ->> 'system_event' = 'conversation_closed'
  );