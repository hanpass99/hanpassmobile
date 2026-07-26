UPDATE public.telegram_messages
SET text = '📱 ' ||
  NULLIF(TRIM(
    COALESCE(raw->'contact'->>'first_name','') || ' ' ||
    COALESCE(raw->'contact'->>'last_name','')
  ), '') || ' · ' || COALESCE(raw->'contact'->>'phone_number', '')
WHERE message_type = 'contact'
  AND (text IS NULL OR text = '')
  AND raw ? 'contact';

-- Fallback for rows missing raw.contact — use the linked chat's stored phone.
UPDATE public.telegram_messages m
SET text = '📱 연락처 · ' || c.phone
FROM public.telegram_chats c
WHERE m.telegram_chat_row_id = c.id
  AND m.message_type = 'contact'
  AND (m.text IS NULL OR m.text = '')
  AND c.phone IS NOT NULL;