
-- Source column for google_form_submissions
ALTER TABLE public.google_form_submissions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'default';

-- Partial unique index for inter pool dedup
CREATE UNIQUE INDEX IF NOT EXISTS customers_google_form_inter_dedup_idx
  ON public.customers (name, phone)
  WHERE pool = 'google_form_activation_inter';

-- Auto-assign trigger: treat inter pool identically to google_form_activation on insert
CREATE OR REPLACE FUNCTION public.auto_assign_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status_changed_at := COALESCE(NEW.status_changed_at, now());

    IF NEW.pool IN ('google_form_activation'::public.customer_pool,
                    'google_form_activation_inter'::public.customer_pool) THEN
      NEW.assigned_to := NULL;
      NEW.status_changed_by := NULL;
      RETURN NEW;
    END IF;

    NEW.status_changed_by := uid;

    IF uid IS NOT NULL
       AND NEW.assigned_to IS NULL
       AND NOT public.has_role(uid, 'admin'::public.app_role) THEN
      NEW.assigned_to := uid;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.status_changed_at := now();
      NEW.status_changed_by := uid;

      IF uid IS NOT NULL THEN
        NEW.assigned_to := uid;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- SLA functions: include the new pool
CREATE OR REPLACE FUNCTION public.sla_violations(_country_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(
  customer_id uuid, customer_name text, phone text,
  country_id uuid, country_code text, status text,
  since timestamptz, deadline timestamptz,
  overdue_hours numeric, overdue_days integer,
  daily_fine integer, fine_total integer, assigned_to uuid
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH sla AS (
    SELECT * FROM (VALUES
      ('new'::public.customer_status, 24, 5000),
      ('in_progress'::public.customer_status, 48, 3000),
      ('no_answer'::public.customer_status, 48, 5000)
    ) AS v(status, hours, fine_amount)
  ),
  policy AS (SELECT public.sla_policy_start() AS start_ts),
  base AS (
    SELECT h.customer_id, c.name, c.phone, c.country_id, co.code AS country_code,
           h.status, h.started_at,
           COALESCE(h.ended_at, now()) AS end_ts,
           h.ended_at IS NULL AS is_open,
           c.assigned_to, s.hours, s.fine_amount
    FROM public.customer_status_history h
    JOIN public.customers c ON c.id = h.customer_id
    JOIN sla s ON s.status = h.status
    LEFT JOIN public.countries co ON co.id = c.country_id
    CROSS JOIN policy p
    WHERE c.pool::text IN ('activation_request','google_form_activation','google_form_activation_inter')
      AND (_country_ids IS NULL OR array_length(_country_ids,1) IS NULL OR c.country_id = ANY(_country_ids))
      AND h.started_at >= p.start_ts
  ),
  calc AS (
    SELECT b.*, b.started_at + (b.hours || ' hours')::interval AS deadline
    FROM base b
  ),
  violating AS (
    SELECT c.customer_id, c.name, c.phone, c.country_id, c.country_code,
           c.status, c.assigned_to, c.started_at, c.end_ts, c.deadline,
           c.fine_amount, c.is_open,
           GREATEST(1, CEIL(EXTRACT(EPOCH FROM (c.end_ts - c.deadline)) / 86400::numeric))::int AS overdue_days
    FROM calc c
    WHERE c.end_ts > c.deadline
  ),
  per_customer AS (
    SELECT customer_id, name, phone, country_id, country_code, assigned_to,
      SUM(overdue_days * fine_amount)::int AS fine_total,
      (ARRAY_AGG(status::text ORDER BY is_open DESC, started_at DESC))[1] AS status,
      (ARRAY_AGG(started_at ORDER BY is_open DESC, started_at DESC))[1] AS since,
      (ARRAY_AGG(deadline ORDER BY is_open DESC, started_at DESC))[1] AS deadline,
      (ARRAY_AGG(fine_amount ORDER BY is_open DESC, started_at DESC))[1] AS daily_fine,
      SUM(overdue_days)::int AS overdue_days_total
    FROM violating
    GROUP BY customer_id, name, phone, country_id, country_code, assigned_to
  )
  SELECT customer_id, name, phone, country_id, country_code, status,
         since, deadline,
         ROUND(EXTRACT(EPOCH FROM (now() - deadline)) / 3600::numeric, 2) AS overdue_hours,
         overdue_days_total AS overdue_days,
         daily_fine, fine_total, assigned_to
  FROM per_customer
  ORDER BY fine_total DESC, since ASC;
$$;

CREATE OR REPLACE FUNCTION public.sla_violations_count()
RETURNS bigint
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH sla AS (
    SELECT * FROM (VALUES
      ('new'::public.customer_status, 24),
      ('in_progress'::public.customer_status, 48),
      ('no_answer'::public.customer_status, 48)
    ) AS v(status, hours)
  ),
  policy AS (SELECT public.sla_policy_start() AS start_ts)
  SELECT COUNT(DISTINCT h.customer_id)::bigint
  FROM public.customer_status_history h
  JOIN public.customers c ON c.id = h.customer_id
  JOIN sla s ON s.status = h.status
  CROSS JOIN policy p
  WHERE c.pool::text IN ('activation_request','google_form_activation','google_form_activation_inter')
    AND h.started_at >= p.start_ts
    AND COALESCE(h.ended_at, now()) > h.started_at + (s.hours || ' hours')::interval;
$$;

CREATE OR REPLACE FUNCTION public.sla_team_summary(_period_start date, _period_end date)
RETURNS TABLE(
  country_id uuid, country_code text, country_name text,
  violations_new bigint, violations_in_progress bigint, violations_absent bigint,
  violations_total bigint,
  gross_fine bigint, adjustments bigint, net_fine bigint
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
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
$$;
