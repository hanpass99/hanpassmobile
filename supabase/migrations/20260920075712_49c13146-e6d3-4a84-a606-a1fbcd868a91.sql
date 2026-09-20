CREATE TABLE IF NOT EXISTS public.system_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_key text NOT NULL,
  category text NOT NULL,
  status text NOT NULL,
  message text NOT NULL,
  metric numeric,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS system_checks_key_time_idx ON public.system_checks (check_key, checked_at DESC);
CREATE INDEX IF NOT EXISTS system_checks_time_idx ON public.system_checks (checked_at DESC);

GRANT SELECT ON public.system_checks TO authenticated;
GRANT ALL ON public.system_checks TO service_role;

ALTER TABLE public.system_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read system checks" ON public.system_checks;
CREATE POLICY "admins read system checks" ON public.system_checks
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.run_system_checks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _rows jsonb := '[]'::jsonb;
  _now timestamptz := now();
  _today date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  _n numeric;
  _n2 numeric;
  _ts timestamptz;
  _dash jsonb;
  _from timestamptz := date_trunc('month', now());
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.system_checks WHERE checked_at < now() - interval '30 days';

  -- 1) 한패스 현황 숫자 정합성: 카드 합계 = 일자별 합계 = 상태별 합계
  BEGIN
    IF auth.uid() IS NULL THEN
      _dash := NULL;
    ELSE
      _dash := public.stats_hanpass_dashboard(_from, _now);
    END IF;

    IF _dash IS NOT NULL THEN
      _n := COALESCE((_dash->'totals'->>'handled')::numeric, 0);
      _n2 := COALESCE((SELECT SUM((e->>'handled')::numeric) FROM jsonb_array_elements(COALESCE(_dash->'daily','[]'::jsonb)) e), 0);

      INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
      VALUES (
        'hanpass_dashboard_daily_sum', 'consistency',
        CASE WHEN _n = _n2 THEN 'ok' ELSE 'error' END,
        CASE WHEN _n = _n2
          THEN '한패스 현황: 카드 처리 건수와 날짜별 합계 일치'
          ELSE format('한패스 현황: 카드 처리 건수(%s)와 날짜별 합계(%s)가 다릅니다', _n, _n2) END,
        ABS(_n - _n2), jsonb_build_object('card', _n, 'daily_sum', _n2));

      _n2 := COALESCE((SELECT SUM(value::numeric) FROM jsonb_each_text(COALESCE(_dash->'status_counts','{}'::jsonb))), 0);
      INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
      VALUES (
        'hanpass_dashboard_status_sum', 'consistency',
        CASE WHEN _n = _n2 THEN 'ok' ELSE 'error' END,
        CASE WHEN _n = _n2
          THEN '한패스 현황: 카드 처리 건수와 상태별 분포 합계 일치'
          ELSE format('한패스 현황: 카드 처리 건수(%s)와 상태별 분포 합계(%s)가 다릅니다', _n, _n2) END,
        ABS(_n - _n2), jsonb_build_object('card', _n, 'status_sum', _n2));

      _n := COALESCE((_dash->'totals'->>'activated')::numeric, 0);
      _n2 := COALESCE((_dash->'status_counts'->>'activated')::numeric, 0);
      INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
      VALUES (
        'hanpass_dashboard_activated', 'consistency',
        CASE WHEN _n = _n2 THEN 'ok' ELSE 'error' END,
        CASE WHEN _n = _n2
          THEN '한패스 현황: 개통 완료 카드와 상태별 개통 완료 일치'
          ELSE format('한패스 현황: 개통 완료 카드(%s)와 상태별 개통 완료(%s)가 다릅니다', _n, _n2) END,
        ABS(_n - _n2), jsonb_build_object('card', _n, 'status', _n2));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.system_checks (check_key, category, status, message, details)
    VALUES ('hanpass_dashboard_daily_sum', 'consistency', 'warn', '한패스 현황 점검 실패: ' || SQLERRM, '{}'::jsonb);
  END;

  -- 2) 고객 상태 합계 = 전체 고객 수
  SELECT COUNT(*) INTO _n FROM public.customers;
  SELECT COALESCE(SUM(c), 0) INTO _n2 FROM (SELECT COUNT(*) c FROM public.customers GROUP BY status) x;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('customers_status_sum', 'consistency',
    CASE WHEN _n = _n2 THEN 'ok' ELSE 'error' END,
    CASE WHEN _n = _n2 THEN format('고객 상태 합계 정상 (%s명)', _n)
         ELSE format('고객 수(%s)와 상태별 합계(%s) 불일치', _n, _n2) END,
    ABS(_n - _n2), jsonb_build_object('total', _n, 'status_sum', _n2));

  -- 3) 미래 날짜 개통일
  SELECT COUNT(*) INTO _n FROM public.customers WHERE activation_date > _today;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('future_activation_date', 'data',
    CASE WHEN _n = 0 THEN 'ok' WHEN _n < 10 THEN 'warn' ELSE 'error' END,
    CASE WHEN _n = 0 THEN '미래 날짜 개통일 없음' ELSE format('개통일이 미래로 입력된 고객 %s명', _n) END,
    _n, '{}'::jsonb);

  -- 4) 전화번호 형식 오류
  SELECT COUNT(*) INTO _n FROM public.customers
   WHERE phone IS NULL OR length(regexp_replace(phone, '[^0-9]', '', 'g')) < 9;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('invalid_phone', 'data',
    CASE WHEN _n = 0 THEN 'ok' WHEN _n < 20 THEN 'warn' ELSE 'error' END,
    CASE WHEN _n = 0 THEN '전화번호 형식 이상 없음' ELSE format('전화번호가 비었거나 형식이 잘못된 고객 %s명', _n) END,
    _n, '{}'::jsonb);

  -- 5) 담당자 없는 고객
  SELECT COUNT(*) INTO _n FROM public.customers WHERE assigned_to IS NULL AND status = 'new';
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('unassigned_customers', 'data',
    CASE WHEN _n = 0 THEN 'ok' WHEN _n < 200 THEN 'warn' ELSE 'error' END,
    CASE WHEN _n = 0 THEN '담당자 미배정 미처리 고객 없음' ELSE format('담당자가 없는 미처리 고객 %s명', _n) END,
    _n, '{}'::jsonb);

  -- 6) 같은 그룹 내 전화번호 중복
  SELECT COUNT(*) INTO _n FROM (
    SELECT pool, phone FROM public.customers
     WHERE phone IS NOT NULL AND phone <> ''
     GROUP BY pool, phone HAVING COUNT(*) > 1) d;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('duplicate_phone', 'data',
    CASE WHEN _n = 0 THEN 'ok' WHEN _n < 50 THEN 'warn' ELSE 'error' END,
    CASE WHEN _n = 0 THEN '같은 그룹 내 번호 중복 없음' ELSE format('같은 그룹에 중복 등록된 번호 %s건', _n) END,
    _n, '{}'::jsonb);

  -- 7) 구글 시트 동기화 최신성
  SELECT MAX(synced_at) INTO _ts FROM public.google_form_submissions;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('google_sheet_sync', 'integration',
    CASE WHEN _ts IS NULL THEN 'error'
         WHEN _ts > now() - interval '24 hours' THEN 'ok'
         WHEN _ts > now() - interval '72 hours' THEN 'warn' ELSE 'error' END,
    CASE WHEN _ts IS NULL THEN '구글 시트 동기화 기록이 없습니다'
         ELSE format('구글 시트 마지막 동기화: %s', to_char(_ts AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI')) END,
    EXTRACT(EPOCH FROM (now() - COALESCE(_ts, now() - interval '999 days'))) / 3600,
    jsonb_build_object('last_at', _ts));

  -- 8) 통화 로그 수신
  SELECT MAX(received_at) INTO _ts FROM public.call_log_ingest;
  SELECT COUNT(*) INTO _n FROM public.call_log_ingest
   WHERE received_at > now() - interval '24 hours' AND parse_ok = false;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('call_log_ingest', 'integration',
    CASE WHEN _ts IS NULL OR _ts < now() - interval '48 hours' THEN 'error'
         WHEN _n > 0 THEN 'warn' ELSE 'ok' END,
    CASE WHEN _ts IS NULL THEN '통화 로그 수신 기록이 없습니다'
         WHEN _ts < now() - interval '48 hours' THEN format('통화 로그가 48시간 이상 수신되지 않았습니다 (마지막 %s)', to_char(_ts AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI'))
         WHEN _n > 0 THEN format('최근 24시간 통화 로그 처리 실패 %s건', _n)
         ELSE '통화 로그 수신 정상' END,
    _n, jsonb_build_object('last_at', _ts));

  -- 9) 텔레그램 메시지 수신
  SELECT MAX(created_at) INTO _ts FROM public.telegram_messages;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('telegram_webhook', 'integration',
    CASE WHEN _ts IS NULL OR _ts < now() - interval '48 hours' THEN 'warn' ELSE 'ok' END,
    CASE WHEN _ts IS NULL THEN '텔레그램 메시지 기록이 없습니다'
         ELSE format('텔레그램 마지막 메시지: %s', to_char(_ts AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI')) END,
    NULL, jsonb_build_object('last_at', _ts));

  -- 10) 문자 발송 실패율 (최근 24시간)
  SELECT COUNT(*) INTO _n FROM public.sms_logs WHERE sent_at > now() - interval '24 hours';
  SELECT COUNT(*) INTO _n2 FROM public.sms_logs
   WHERE sent_at > now() - interval '24 hours' AND status <> 'success';
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('sms_failure_rate', 'integration',
    CASE WHEN _n = 0 THEN 'ok'
         WHEN _n2::numeric / _n > 0.2 THEN 'error'
         WHEN _n2 > 0 THEN 'warn' ELSE 'ok' END,
    CASE WHEN _n = 0 THEN '최근 24시간 문자 발송 없음'
         ELSE format('최근 24시간 문자 %s건 중 실패 %s건', _n, _n2) END,
    CASE WHEN _n = 0 THEN 0 ELSE round(_n2::numeric * 100 / _n, 1) END,
    jsonb_build_object('total', _n, 'failed', _n2));

  -- 11) 데이터베이스 용량
  SELECT pg_database_size(current_database())::numeric / (1024*1024*1024) INTO _n;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('db_size', 'system',
    CASE WHEN _n > 6 THEN 'error' WHEN _n > 4 THEN 'warn' ELSE 'ok' END,
    format('데이터베이스 사용량 %s GB', round(_n, 2)),
    round(_n, 2), '{}'::jsonb);

  -- 12) 데이터베이스 접속 포화도
  SELECT COUNT(*)::numeric INTO _n FROM pg_stat_activity;
  SELECT current_setting('max_connections')::numeric INTO _n2;
  INSERT INTO public.system_checks (check_key, category, status, message, metric, details)
  VALUES ('db_connections', 'system',
    CASE WHEN _n / _n2 > 0.9 THEN 'error' WHEN _n / _n2 > 0.7 THEN 'warn' ELSE 'ok' END,
    format('데이터베이스 접속 %s / %s', _n, _n2),
    round(_n * 100 / _n2, 1), jsonb_build_object('used', _n, 'max', _n2));

  SELECT jsonb_build_object(
    'checked_at', _now,
    'error', COUNT(*) FILTER (WHERE status = 'error'),
    'warn', COUNT(*) FILTER (WHERE status = 'warn'),
    'ok', COUNT(*) FILTER (WHERE status = 'ok')
  ) INTO _rows
  FROM public.system_checks WHERE checked_at >= _now;

  RETURN _rows;
END;
$function$;

CREATE OR REPLACE FUNCTION public.latest_system_checks()
RETURNS TABLE(check_key text, category text, status text, message text, metric numeric, details jsonb, checked_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (c.check_key)
    c.check_key, c.category, c.status, c.message, c.metric, c.details, c.checked_at
  FROM public.system_checks c
  WHERE public.has_role(auth.uid(), 'admin')
  ORDER BY c.check_key, c.checked_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.run_system_checks() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.latest_system_checks() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_system_checks() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.latest_system_checks() TO authenticated, service_role;