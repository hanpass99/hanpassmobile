UPDATE public.customers
SET
  requested_plan = COALESCE(
    NULLIF(requested_plan, ''),
    NULLIF(btrim(substring(notes from '요금제: ([^·]+)')), '')
  ),
  carrier_plan = COALESCE(
    NULLIF(carrier_plan, ''),
    NULLIF(btrim(substring(notes from '통신사: ([^·]+)')), '')
  )
WHERE pool = 'activation_request'
  AND notes ILIKE '%접수완료 시트 자동 등록%'
  AND (
    requested_plan IS NULL OR requested_plan = '' OR
    carrier_plan IS NULL OR carrier_plan = ''
  );