
CREATE OR REPLACE FUNCTION public.set_channel_from_pool()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE target_name text;
BEGIN
  IF NEW.channel_id IS NULL THEN
    target_name := CASE NEW.pool
      WHEN 'existing'::customer_pool THEN '한패스 모바일 기존 고객'
      WHEN 'new_signup'::customer_pool THEN '한패스 신규 가입자'
      WHEN 'prepaid'::customer_pool THEN '선불 충전자'
      WHEN 'activation_request'::customer_pool THEN '개통 신청자'
    END;
    IF target_name IS NOT NULL THEN
      SELECT id INTO NEW.channel_id FROM public.channels WHERE name = target_name LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_channel_from_pool ON public.customers;
CREATE TRIGGER trg_set_channel_from_pool
BEFORE INSERT OR UPDATE OF pool ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.set_channel_from_pool();

-- Backfill existing rows
UPDATE public.customers c
SET channel_id = ch.id
FROM public.channels ch
WHERE c.channel_id IS NULL
  AND ch.name = CASE c.pool
    WHEN 'existing'::customer_pool THEN '한패스 모바일 기존 고객'
    WHEN 'new_signup'::customer_pool THEN '한패스 신규 가입자'
    WHEN 'prepaid'::customer_pool THEN '선불 충전자'
    WHEN 'activation_request'::customer_pool THEN '개통 신청자'
  END;
