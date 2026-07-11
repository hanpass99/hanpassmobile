-- 1) 새로운 customer_pool 값 추가
ALTER TYPE public.customer_pool ADD VALUE IF NOT EXISTS 'google_form_activation';

-- 2) SLA 함수들 재정의: activation_request + google_form_activation 두 pool 모두 포함
--    (신규 enum 값을 같은 트랜잭션에서 캐스트하지 않기 위해 text 비교 사용)

CREATE OR REPLACE FUNCTION public.sla_violations_count()
 RETURNS bigint
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH sla AS (
    SELECT * FROM (VALUES
      ('new'::public.customer_status, 24),
      ('in_progress'::public.customer_status, 48),
      ('no_answer'::public.customer_status, 48)
    ) AS v(status, hours)
  ),
  policy AS (SELECT public.sla_policy_start() AS start_ts)
  SELECT COUNT(*)::bigint FROM public.customers c
  JOIN sla s ON s.status = c.status
  CROSS JOIN policy p
  WHERE c.pool::text IN ('activation_request','google_form_activation')
    AND (CASE WHEN c.status='new'::public.customer_status THEN c.imported_at
              ELSE COALESCE(c.status_changed_at, c.imported_at) END) >= p.start_ts
    AND now() > ((CASE WHEN c.status='new'::public.customer_status THEN c.imported_at
                       ELSE COALESCE(c.status_changed_at, c.imported_at) END)
                 + (s.hours || ' hours')::interval);
$function$;

CREATE OR REPLACE FUNCTION public.sla_violations(_country_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(customer_id uuid, customer_name text, phone text, country_id uuid, country_code text, status text, since timestamp with time zone, deadline timestamp with time zone, overdue_hours numeric, overdue_days integer, daily_fine integer, fine_total integer, assigned_to uuid)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH sla AS (
    SELECT * FROM (VALUES
      ('new'::public.customer_status, 24, 5000),
      ('in_progress'::public.customer_status, 48, 3000),
      ('no_answer'::public.customer_status, 48, 5000)
    ) AS v(status, hours, fine_amount)
  ),
  policy AS (SELECT public.sla_policy_start() AS start_ts),
  base AS (
    SELECT c.id, c.name, c.phone, c.country_id, co.code AS country_code, c.status,
      CASE WHEN c.status = 'new'::public.customer_status THEN c.imported_at
           ELSE COALESCE(c.status_changed_at, c.imported_at) END AS since_ts,
      s.hours, s.fine_amount, c.assigned_to
    FROM public.customers c
    JOIN sla s ON s.status = c.status
    LEFT JOIN public.countries co ON co.id = c.country_id
    CROSS JOIN policy p
    WHERE c.pool::text IN ('activation_request','google_form_activation')
      AND (_country_ids IS NULL OR array_length(_country_ids,1) IS NULL OR c.country_id = ANY(_country_ids))
      AND (CASE WHEN c.status = 'new'::public.customer_status THEN c.imported_at
                ELSE COALESCE(c.status_changed_at, c.imported_at) END) >= p.start_ts
  ),
  calc AS (
    SELECT id, name, phone, country_id, country_code, status::text AS status, since_ts, hours, fine_amount, assigned_to,
      since_ts + (hours || ' hours')::interval AS deadline
    FROM base
  )
  SELECT c.id, c.name, c.phone, c.country_id, c.country_code, c.status, c.since_ts, c.deadline,
    ROUND(EXTRACT(EPOCH FROM (now() - c.deadline)) / 3600::numeric, 2) AS overdue_hours,
    GREATEST(1, CEIL(EXTRACT(EPOCH FROM (now() - c.deadline)) / 86400::numeric))::int AS overdue_days,
    c.fine_amount AS daily_fine,
    (GREATEST(1, CEIL(EXTRACT(EPOCH FROM (now() - c.deadline)) / 86400::numeric)) * c.fine_amount)::int AS fine_total,
    c.assigned_to
  FROM calc c
  WHERE now() > c.deadline
  ORDER BY c.deadline ASC;
$function$;

CREATE OR REPLACE FUNCTION public.sla_upcoming_violations(_country_ids uuid[] DEFAULT NULL::uuid[], _within_hours integer DEFAULT 24)
 RETURNS TABLE(customer_id uuid, customer_name text, phone text, country_id uuid, country_code text, status text, since timestamp with time zone, deadline timestamp with time zone, hours_remaining numeric, fine_amount integer, assigned_to uuid)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH sla AS (
    SELECT * FROM (VALUES
      ('new'::public.customer_status, 24, 5000),
      ('in_progress'::public.customer_status, 48, 3000),
      ('no_answer'::public.customer_status, 48, 5000)
    ) AS v(status, hours, fine_amount)
  ),
  policy AS (SELECT public.sla_policy_start() AS start_ts),
  base AS (
    SELECT c.id, c.name, c.phone, c.country_id, co.code AS country_code, c.status,
      CASE WHEN c.status = 'new'::public.customer_status THEN c.imported_at
           ELSE COALESCE(c.status_changed_at, c.imported_at) END AS since_ts,
      s.hours, s.fine_amount, c.assigned_to
    FROM public.customers c
    JOIN sla s ON s.status = c.status
    LEFT JOIN public.countries co ON co.id = c.country_id
    CROSS JOIN policy p
    WHERE c.pool::text IN ('activation_request','google_form_activation')
      AND (_country_ids IS NULL OR array_length(_country_ids,1) IS NULL OR c.country_id = ANY(_country_ids))
      AND (CASE WHEN c.status = 'new'::public.customer_status THEN c.imported_at
                ELSE COALESCE(c.status_changed_at, c.imported_at) END) >= p.start_ts
  ),
  calc AS (
    SELECT id, name, phone, country_id, country_code, status::text AS status, since_ts,
      since_ts + (hours || ' hours')::interval AS deadline,
      fine_amount, assigned_to
    FROM base
  )
  SELECT c.id, c.name, c.phone, c.country_id, c.country_code, c.status, c.since_ts, c.deadline,
    ROUND(EXTRACT(EPOCH FROM (c.deadline - now())) / 3600::numeric, 2) AS hours_remaining,
    c.fine_amount, c.assigned_to
  FROM calc c
  WHERE c.deadline > now()
    AND c.deadline <= now() + (_within_hours || ' hours')::interval
  ORDER BY c.deadline ASC;
$function$;

CREATE OR REPLACE FUNCTION public.sla_team_summary(_period_start date, _period_end date)
 RETURNS TABLE(country_id uuid, country_code text, country_name text, violations_new bigint, violations_in_progress bigint, violations_absent bigint, violations_total bigint, gross_fine bigint, adjustments bigint, net_fine bigint)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH sla AS (
    SELECT * FROM (VALUES
      ('new'::public.customer_status, 24, 5000),
      ('in_progress'::public.customer_status, 48, 3000),
      ('no_answer'::public.customer_status, 48, 5000)
    ) AS v(status, hours, fine_amount)
  ),
  policy AS (SELECT public.sla_policy_start() AS start_ts),
  base AS (
    SELECT c.id, c.country_id, c.status,
      (CASE WHEN c.status='new'::public.customer_status THEN c.imported_at
            ELSE COALESCE(c.status_changed_at, c.imported_at) END)
        + (s.hours || ' hours')::interval AS deadline,
      s.fine_amount
    FROM public.customers c
    JOIN sla s ON s.status = c.status
    CROSS JOIN policy p
    WHERE c.pool::text IN ('activation_request','google_form_activation')
      AND (CASE WHEN c.status='new'::public.customer_status THEN c.imported_at
                ELSE COALESCE(c.status_changed_at, c.imported_at) END) >= p.start_ts
  ),
  win AS (
    SELECT b.id, b.country_id, b.status, b.fine_amount,
      (now() > b.deadline
       AND b.deadline <= (_period_end + 1)::timestamptz
       AND b.deadline >= _period_start::timestamptz) AS is_violating_in_window,
      (now() > b.deadline) AS is_violating
    FROM base b
  ),
  agg AS (
    SELECT country_id,
      count(*) FILTER (WHERE is_violating AND status='new'::public.customer_status) AS v_new,
      count(*) FILTER (WHERE is_violating AND status='in_progress'::public.customer_status) AS v_ip,
      count(*) FILTER (WHERE is_violating AND status='no_answer'::public.customer_status) AS v_ab,
      count(*) FILTER (WHERE is_violating) AS v_total,
      COALESCE(SUM(CASE WHEN is_violating_in_window THEN fine_amount ELSE 0 END), 0)::bigint AS gross
    FROM win
    GROUP BY country_id
  ),
  adj AS (
    SELECT country_id,
      COALESCE(SUM(CASE WHEN adjustment_type='waive' THEN -amount ELSE 0 END), 0)::bigint AS waive_delta,
      bool_or(adjustment_type = 'reset') AS has_reset,
      MAX(CASE WHEN adjustment_type='override' THEN amount END) AS override_amount
    FROM public.sla_fine_adjustments
    WHERE period_start <= _period_end AND period_end >= _period_start
    GROUP BY country_id
  )
  SELECT co.id, co.code, co.name_ko,
    COALESCE(a.v_new,0), COALESCE(a.v_ip,0), COALESCE(a.v_ab,0), COALESCE(a.v_total,0),
    COALESCE(a.gross,0)::bigint,
    COALESCE(adj.waive_delta,0)::bigint,
    (CASE
      WHEN adj.has_reset THEN 0
      WHEN adj.override_amount IS NOT NULL THEN adj.override_amount::bigint
      ELSE GREATEST(0, COALESCE(a.gross,0) + COALESCE(adj.waive_delta,0))
    END)::bigint AS net_fine
  FROM public.countries co
  LEFT JOIN agg a ON a.country_id = co.id
  LEFT JOIN adj ON adj.country_id = co.id
  WHERE co.is_active = true
    AND (COALESCE(a.v_total,0) > 0 OR COALESCE(a.gross,0) > 0 OR adj.country_id IS NOT NULL)
  ORDER BY net_fine DESC, v_total DESC;
$function$;