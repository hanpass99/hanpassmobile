-- 대시보드 통계 추가 개선 (2026-10-29)
-- 1) stats_daily_calls: 통화 수와 개통 수를 같은 테이블에서 두 번 읽던 것을 한 번에 집계
-- 2) stats_call_completed: "(날짜 IS NULL OR call_date >= 날짜)" 형태 대신 -infinity/infinity 기본값으로
--    바꿔 날짜 인덱스를 사용. call_date 가 NULL 인 행은 예전에도 집계에서 제외됐으므로 결과 동일.

CREATE OR REPLACE FUNCTION public.stats_daily_calls(
  _date_from timestamp with time zone,
  _date_to timestamp with time zone,
  _country_id uuid DEFAULT NULL::uuid,
  _pool public.customer_pool DEFAULT NULL::public.customer_pool
)
RETURNS TABLE(day date, calls bigint, activations bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT _date_from::date AS date_from, _date_to::date AS date_to
  ),
  days AS (
    SELECT generate_series((SELECT date_from FROM bounds), (SELECT date_to FROM bounds), interval '1 day')::date AS day
  ),
  agg AS (
    SELECT r.call_date AS day,
      (count(*) FILTER (WHERE r.staff_id IS NOT NULL))::bigint AS calls,
      (count(*) FILTER (WHERE r.staff_id IS NOT NULL
                          AND c.status = 'activated'::public.customer_status))::bigint AS activations
    FROM public.customer_call_rounds r
    JOIN public.customers c ON c.id = r.customer_id
    CROSS JOIN bounds b
    WHERE r.call_date >= b.date_from
      AND r.call_date <= b.date_to
      AND (_country_id IS NULL OR c.country_id = _country_id)
      AND (_pool IS NULL OR c.pool = _pool)
    GROUP BY r.call_date
  )
  SELECT d.day, coalesce(a.calls, 0)::bigint, coalesce(a.activations, 0)::bigint
  FROM days d
  LEFT JOIN agg a ON a.day = d.day
  ORDER BY d.day;
$function$;

CREATE OR REPLACE FUNCTION public.stats_call_completed(
  _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _country_id uuid DEFAULT NULL::uuid,
  _pool public.customer_pool DEFAULT NULL::public.customer_pool
)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT (count(*) FILTER (WHERE r.staff_id IS NOT NULL))::bigint
  FROM public.customer_call_rounds r
  JOIN public.customers c ON c.id = r.customer_id
  WHERE r.call_date >= COALESCE(_date_from::date, '-infinity'::date)
    AND r.call_date <= COALESCE(_date_to::date, 'infinity'::date)
    AND (_country_id IS NULL OR c.country_id = _country_id)
    AND (_pool IS NULL OR c.pool = _pool);
$function$;
