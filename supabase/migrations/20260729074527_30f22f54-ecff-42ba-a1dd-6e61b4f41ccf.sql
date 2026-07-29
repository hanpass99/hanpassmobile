DROP POLICY IF EXISTS "sla_adj_select_authenticated" ON public.sla_fine_adjustments;
CREATE POLICY "sla_adj_select_authenticated" ON public.sla_fine_adjustments FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.sla_fine_adjustments TO authenticated;

CREATE OR REPLACE FUNCTION public.sla_team_summary(_period_start date, _period_end date)
RETURNS TABLE(country_id uuid, country_code text, country_name text, violations_new bigint, violations_in_progress bigint, violations_absent bigint, violations_total bigint, gross_fine bigint, adjustments bigint, net_fine bigint)
LANGUAGE sql
STABLE
SET search_path = public
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
    SELECT h.customer_id, c.country_id, h.status, s.fine_amount,
      h.started_at + (s.hours || ' hours')::interval AS deadline,
      COALESCE(h.ended_at, now()) AS end_ts
    FROM public.customer_status_history h
    JOIN public.customers c ON c.id = h.customer_id
    JOIN sla s ON s.status = h.status
    CROSS JOIN policy p
    WHERE c.pool::text IN ('activation_request','google_form_activation','google_form_activation_inter')
      AND h.started_at >= p.start_ts
  ),
  win AS (
    SELECT b.customer_id, b.country_id, b.status, b.fine_amount, b.deadline, b.end_ts,
      GREATEST(b.deadline, _period_start::timestamptz) AS clip_start,
      LEAST(b.end_ts, (_period_end + 1)::timestamptz) AS clip_end
    FROM base b
  ),
  win_days AS (
    SELECT customer_id, country_id, status, fine_amount,
      CASE WHEN clip_end > clip_start
           THEN CEIL(EXTRACT(EPOCH FROM (clip_end - clip_start)) / 86400::numeric)::int
           ELSE 0 END AS days_in_window,
      end_ts > deadline AS is_violating
    FROM win
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
      COALESCE(SUM(CASE WHEN adjustment_type='waive' THEN -amount ELSE 0 END), 0)::bigint AS waive_delta,
      bool_or(adjustment_type='reset') AS has_reset,
      MAX(CASE WHEN adjustment_type='override' THEN amount END) AS override_amount
    FROM public.sla_fine_adjustments
    WHERE period_start <= _period_start AND period_end >= _period_end
    GROUP BY country_id
  )
  SELECT co.id, co.code, co.name_ko,
    COALESCE(a.v_new,0)::bigint, COALESCE(a.v_ip,0)::bigint, COALESCE(a.v_ab,0)::bigint, COALESCE(a.v_total,0)::bigint,
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