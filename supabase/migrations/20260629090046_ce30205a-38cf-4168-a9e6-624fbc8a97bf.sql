CREATE OR REPLACE FUNCTION public.set_channel_from_pool()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
    END;
    IF target_name IS NOT NULL THEN
      SELECT id INTO NEW.channel_id FROM public.channels WHERE name = target_name LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END $function$;