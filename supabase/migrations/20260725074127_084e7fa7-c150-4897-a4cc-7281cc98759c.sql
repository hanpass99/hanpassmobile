
-- 1) 접수완료 시트 자동 등록 건 중 activation_request에 (이름·전화·접수일)이 이미 있는 경우 제거
DELETE FROM public.customers c
WHERE c.pool = 'google_form_activation'
  AND c.notes LIKE '접수완료 시트 자동 등록%'
  AND EXISTS (
    SELECT 1 FROM public.customers x
    WHERE x.pool = 'activation_request'
      AND x.name = c.name
      AND x.phone = c.phone
      AND x.signup_date IS NOT DISTINCT FROM c.signup_date
  );

-- 2) 나머지는 activation_request로 이동
UPDATE public.customers
SET pool = 'activation_request'
WHERE pool = 'google_form_activation'
  AND notes LIKE '접수완료 시트 자동 등록%';

-- 3) activation_request 풀 내 기존 중복 정리 (같은 이름·전화·접수일 → 가장 오래된 것만 유지)
DELETE FROM public.customers c
USING (
  SELECT id, row_number() OVER (
    PARTITION BY name, phone, signup_date
    ORDER BY created_at ASC, id ASC
  ) AS rn
  FROM public.customers
  WHERE pool = 'activation_request'
) d
WHERE c.id = d.id AND d.rn > 1;

-- 4) 유니크 인덱스 생성
CREATE UNIQUE INDEX IF NOT EXISTS customers_activation_request_dedup_idx
  ON public.customers (name, phone, signup_date)
  WHERE pool = 'activation_request';
