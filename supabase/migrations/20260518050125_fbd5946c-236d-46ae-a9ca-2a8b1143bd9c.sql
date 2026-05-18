-- 직원 콜 실적은 명시적 call_round 변경(또는 신규 부여)만 인정.
-- 단순 status 변경으로 자동 기록되던 로직(Case B) 제거.
CREATE OR REPLACE FUNCTION public.record_call_round()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- call_round 가 새로 부여되었거나 값이 변경된 경우에만 콜 실적으로 기록
  -- (customer_id, call_date) UNIQUE 제약으로 동일 직원/고객의 같은 날 중복은 1건으로 자동 dedup
  IF NEW.call_round IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.call_round IS DISTINCT FROM OLD.call_round)
     AND auth.uid() IS NOT NULL THEN
    INSERT INTO public.customer_call_rounds (customer_id, staff_id, round, call_date)
    VALUES (NEW.id, auth.uid(), NEW.call_round, CURRENT_DATE)
    ON CONFLICT (customer_id, call_date)
    DO UPDATE SET round = EXCLUDED.round, staff_id = EXCLUDED.staff_id, updated_at = now();
  END IF;

  RETURN NEW;
END $function$;