-- 대시보드·직원 통계 속도 개선 (2026-10-29)
-- customer_call_rounds 에는 (staff_id, customer_id, call_date) UNIQUE 인덱스가 있으므로
--   count(DISTINCT 문자열 이어붙이기) 와 DISTINCT ON (...정렬...) 은 결과에 영향 없이 비용만 큼.
--   staff_id 또는 call_date 가 NULL 인 행은 예전 식에서도 집계되지 않았으므로 같은 조건으로 제외.
-- 결과는 예전과 동일하고, 문자열 생성·정렬 단계만 사라짐.

CREATE OR REPLACE FUNCTION public.stats_totals(
  _date_from timestamp with time zone,
  _date_to timestamp with time zone,
  _year integer,
  _month integer,
  _country_id uuid DEFAULT NULL::uuid,
  _pool public.customer_pool DEFAULT NULL::public.customer_pool
)
RETURNS TABLE(total_calls bigint, total_customers bigint, monthly_target_total bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT _date_from::date AS date_from, _date_to::date AS date_to
  )
  SELECT
    (SELECT (count(*) FILTER (WHERE r.staff_id IS NOT NULL AND r.call_date IS NOT NULL))::bigint
     FROM public.customer_call_rounds r
     JOIN public.customers c ON c.id = r.customer_id
     CROSS JOIN bounds b
     WHERE r.call_date >= b.date_from
       AND r.call_date <= b.date_to
       AND (_country_id IS NULL OR c.country_id = _country_id)
       AND (_pool IS NULL OR c.pool = _pool)),
    (SELECT count(*)::bigint
     FROM public.customers c
     WHERE c.imported_at >= _date_from
       AND c.imported_at <= _date_to
       AND (_country_id IS NULL OR c.country_id = _country_id)
       AND (_pool IS NULL OR c.pool = _pool)),
    (SELECT coalesce(sum(t.activation_target), 0)::bigint
     FROM public.targets t
     WHERE t.year = _year AND t.month = _month);
$function$;

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
  calls AS (
    SELECT r.call_date AS day,
      (count(*) FILTER (WHERE r.staff_id IS NOT NULL AND r.call_date IS NOT NULL))::bigint AS calls
    FROM public.customer_call_rounds r
    JOIN public.customers c ON c.id = r.customer_id
    CROSS JOIN bounds b
    WHERE r.call_date >= b.date_from
      AND r.call_date <= b.date_to
      AND (_country_id IS NULL OR c.country_id = _country_id)
      AND (_pool IS NULL OR c.pool = _pool)
    GROUP BY r.call_date
  ),
  acts AS (
    SELECT r.call_date AS day,
      (count(*) FILTER (WHERE r.staff_id IS NOT NULL AND r.call_date IS NOT NULL))::bigint AS activations
    FROM public.customer_call_rounds r
    JOIN public.customers c ON c.id = r.customer_id
    CROSS JOIN bounds b
    WHERE r.call_date >= b.date_from
      AND r.call_date <= b.date_to
      AND c.status = 'activated'::public.customer_status
      AND (_country_id IS NULL OR c.country_id = _country_id)
      AND (_pool IS NULL OR c.pool = _pool)
    GROUP BY r.call_date
  )
  SELECT d.day, coalesce(c.calls, 0)::bigint, coalesce(a.activations, 0)::bigint
  FROM days d
  LEFT JOIN calls c ON c.day = d.day
  LEFT JOIN acts a ON a.day = d.day
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
  SELECT (count(*) FILTER (WHERE r.staff_id IS NOT NULL AND r.call_date IS NOT NULL))::bigint
  FROM public.customer_call_rounds r
  JOIN public.customers c ON c.id = r.customer_id
  WHERE (_date_from IS NULL OR r.call_date >= _date_from::date)
    AND (_date_to IS NULL OR r.call_date <= _date_to::date)
    AND (_country_id IS NULL OR c.country_id = _country_id)
    AND (_pool IS NULL OR c.pool = _pool);
$function$;

CREATE OR REPLACE FUNCTION public.stats_staff_ranking(
  _date_from timestamp with time zone,
  _date_to timestamp with time zone,
  _year integer,
  _month integer,
  _country_id uuid DEFAULT NULL::uuid,
  _attendance_date date DEFAULT NULL::date
)
RETURNS TABLE(user_id uuid, display_name text, total_calls bigint, activated bigint, activation_target integer, attendance text)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT _date_from::date AS date_from, _date_to::date AS date_to
  ),
  call_base AS (
    SELECT
      r.staff_id,
      r.customer_id,
      c.status,
      r.call_date
    FROM public.customer_call_rounds r
    JOIN public.customers c ON c.id = r.customer_id
    CROSS JOIN bounds b
    WHERE r.call_date >= b.date_from
      AND r.call_date <= b.date_to
      AND r.staff_id IS NOT NULL
      AND (_country_id IS NULL OR c.country_id = _country_id)
  ),
  calls AS (
    SELECT staff_id, count(*)::bigint AS cnt
    FROM call_base
    GROUP BY staff_id
  ),
  acts AS (
    SELECT staff_id, count(*)::bigint AS cnt
    FROM call_base
    WHERE status = 'activated'::public.customer_status
    GROUP BY staff_id
  )
  SELECT p.id, p.display_name,
    coalesce(ca.cnt, 0), coalesce(ac.cnt, 0),
    coalesce(t.activation_target, 0),
    COALESCE(att.status::text, 'present') AS attendance
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'staff'::public.app_role
  LEFT JOIN calls ca ON ca.staff_id = p.id
  LEFT JOIN acts ac ON ac.staff_id = p.id
  LEFT JOIN public.targets t ON t.user_id = p.id AND t.year = _year AND t.month = _month
  LEFT JOIN public.staff_attendance att
    ON att.user_id = p.id AND att.attendance_date = COALESCE(_attendance_date, CURRENT_DATE)
  WHERE p.is_active = true
    AND (
      _attendance_date IS NULL
      OR COALESCE(att.status::text, 'present') = 'present'
    )
  ORDER BY p.sort_order NULLS LAST, ac.cnt DESC NULLS LAST, ca.cnt DESC NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.stats_by_staff(
  _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS TABLE(user_id uuid, display_name text, total bigint, status_counts jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT
      COALESCE(_date_from::date, '-infinity'::date) AS date_from,
      COALESCE(_date_to::date, 'infinity'::date) AS date_to
  ),
  base AS (
    SELECT
      r.staff_id,
      c.status::text AS status,
      r.customer_id,
      r.call_date
    FROM public.customer_call_rounds r
    JOIN public.customers c ON c.id = r.customer_id
    CROSS JOIN bounds b
    WHERE r.call_date >= b.date_from
      AND r.call_date <= b.date_to
      AND r.staff_id IS NOT NULL
  ),
  per AS (
    SELECT staff_id, status, count(*)::int AS cnt
    FROM base
    GROUP BY staff_id, status
  ),
  agg AS (
    SELECT staff_id, sum(cnt)::bigint AS total, jsonb_object_agg(status, cnt) AS status_counts
    FROM per
    GROUP BY staff_id
  )
  SELECT p.id, p.display_name, coalesce(a.total, 0), coalesce(a.status_counts, '{}'::jsonb)
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'staff'::public.app_role
  LEFT JOIN agg a ON a.staff_id = p.id
  WHERE p.is_active = true
  ORDER BY p.sort_order NULLS LAST, p.display_name;
$function$;
