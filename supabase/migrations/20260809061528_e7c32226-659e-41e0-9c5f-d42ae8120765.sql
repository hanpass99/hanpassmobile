CREATE OR REPLACE FUNCTION public.sla_team_summary(_period_start date, _period_end date)
 RETURNS TABLE(country_id uuid, country_code text, country_name text, violations_new bigint, violations_in_progress bigint, violations_absent bigint, violations_total bigint, gross_fine bigint, adjustments bigint, net_fine bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH sla AS (
    SELECT * FROM (VALUES
      ('new'::public.customer_status, 24, 5000),
      ('in_progress'::public.customer_status, 48, 3000),
      ('no_answer'::public.customer_status, 48, 5000)
    ) AS v(status, hours, fine_amount)
  ),
  policy AS (SELECT public.sla_policy_start() AS start_ts),
  resets AS (
    SELECT r.country_id, MAX((r.created_at AT TIME ZONE 'Asia/Seoul')::date) AS cut_date
    FROM public.sla_fine_adjustments r
    WHERE r.adjustment_type = 'reset'
    GROUP BY r.country_id
  ),
  base AS (
    SELECT h.customer_id, c.country_id, c.assigned_to, h.status, s.fine_amount,
      h.started_at + (s.hours || ' hours')::interval AS deadline,
      COALESCE(h.ended_at, now()) AS end_ts
    FROM public.customer_status_history h
    JOIN public.customers c ON c.id = h.customer_id
    JOIN sla s ON s.status = h.status
    CROSS JOIN policy p
    WHERE c.pool::text IN ('activation_request','google_form_activation','google_form_activation_inter')
      AND c.assigned_to IS NOT NULL
      AND h.started_at >= p.start_ts
  ),
  win AS (
    SELECT b.customer_id, b.country_id, b.assigned_to, b.status, b.fine_amount, b.deadline, b.end_ts,
      GREATEST(b.deadline, _period_start::timestamp AT TIME ZONE 'Asia/Seoul') AS clip_start,
      LEAST(b.end_ts, ((_period_end + 1)::timestamp AT TIME ZONE 'Asia/Seoul')) AS clip_end
    FROM base b
  ),
  win_days AS (
    SELECT w.customer_id, w.country_id, w.status, w.fine_amount,
      COUNT(DISTINCT a.attendance_date)::int AS days_in_window,
      COUNT(DISTINCT a.attendance_date) > 0 AS is_violating
    FROM win w
    LEFT JOIN resets rs ON rs.country_id = w.country_id
    LEFT JOIN public.staff_attendance a
      ON a.user_id = w.assigned_to
     AND a.status = 'present'::public.attendance_status
     AND a.attendance_date BETWEEN (w.clip_start AT TIME ZONE 'Asia/Seoul')::date
                               AND ((w.clip_end - interval '1 microsecond') AT TIME ZONE 'Asia/Seoul')::date
     AND w.clip_end > w.clip_start
     AND (rs.cut_date IS NULL OR a.attendance_date > rs.cut_date)
    GROUP BY w.customer_id, w.country_id, w.status, w.fine_amount
  ),
  agg AS (
    SELECT country_id,
      COUNT(DISTINCT CASE WHEN is_violating AND status='new'::public.customer_status THEN customer_id END) AS v_new,
      COUNT(DISTINCT CASE WHEN is_violating AND status='in_progress'::public.customer_status THEN customer_id END) AS v_ip,
      COUNT(DISTINCT CASE WHEN is_violating AND status='no_answer'::public.customer_status THEN customer_id END) AS v_ab,
      COUNT(DISTINCT CASE WHEN is_violating THEN customer_id END) AS v_total,
      COALESCE(SUM(days_in_window * fine_amount), 0)::bigint AS gross
    FROM win_days
    GROUP BY country_id
  ),
  adj AS (
    SELECT country_id,
      COALESCE(SUM(CASE WHEN adjustment_type='waive'
                          AND period_start <= _period_end AND period_end >= _period_start
                        THEN -amount ELSE 0 END), 0)::bigint AS waive_delta,
      MAX(CASE WHEN adjustment_type='override'
                 AND period_start <= _period_start AND period_end >= _period_end
               THEN amount END) AS override_amount
    FROM public.sla_fine_adjustments
    WHERE period_start <= _period_end AND period_end >= _period_start
    GROUP BY country_id
  )
  SELECT co.id, co.code, co.name_ko,
    COALESCE(a.v_new,0)::bigint, COALESCE(a.v_ip,0)::bigint, COALESCE(a.v_ab,0)::bigint, COALESCE(a.v_total,0)::bigint,
    COALESCE(a.gross,0)::bigint,
    COALESCE(adj.waive_delta,0)::bigint,
    (CASE
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