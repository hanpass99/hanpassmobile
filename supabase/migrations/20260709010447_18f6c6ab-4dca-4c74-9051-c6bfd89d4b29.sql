
-- 1) enum에 새 pool 값 추가
ALTER TYPE public.customer_pool ADD VALUE IF NOT EXISTS 'one_year_activation';

-- 2) 고객 테이블에 컬럼 추가
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS monthly_fee numeric,
  ADD COLUMN IF NOT EXISTS customer_type text;

-- 3) 만기 임박 조회에 도움될 인덱스 (활성일 기준)
CREATE INDEX IF NOT EXISTS idx_customers_pool_activation_date
  ON public.customers (pool, activation_date);

-- 4) 채널 자동 지정 트리거에 새 pool 매핑 추가
CREATE OR REPLACE FUNCTION public.set_channel_from_pool()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE target_name text;
BEGIN
  IF NEW.channel_id IS NULL THEN
    target_name := CASE NEW.pool
      WHEN 'existing'::customer_pool THEN '한패스 모바일 기존 고객'
      WHEN 'new_signup'::customer_pool THEN '한패스 신규 가입자'
      WHEN 'prepaid_charge'::customer_pool THEN '선불 충전자'
      WHEN 'activation_request'::customer_pool THEN '개통 신청자'
      WHEN 'friend_referral'::customer_pool THEN '추천인 (Referral)'
      WHEN 'one_year_activation'::customer_pool THEN '1년 개통자'
    END;
    IF target_name IS NOT NULL THEN
      SELECT id INTO NEW.channel_id FROM public.channels WHERE name = target_name LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- 5) '1년 개통자' 채널 시드
INSERT INTO public.channels (name, is_active)
SELECT '1년 개통자', true
WHERE NOT EXISTS (SELECT 1 FROM public.channels WHERE name = '1년 개통자');
