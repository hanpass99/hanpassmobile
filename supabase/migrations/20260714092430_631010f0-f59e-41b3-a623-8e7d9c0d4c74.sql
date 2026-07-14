
-- 1) Status history table
CREATE TABLE IF NOT EXISTS public.customer_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  status public.customer_status NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.customer_status_history TO authenticated;
GRANT ALL ON public.customer_status_history TO service_role;

ALTER TABLE public.customer_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read status history"
  ON public.customer_status_history FOR SELECT
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_csh_customer ON public.customer_status_history(customer_id, started_at);
CREATE INDEX IF NOT EXISTS idx_csh_status_open ON public.customer_status_history(status) WHERE ended_at IS NULL;

-- 2) Backfill from current customers
INSERT INTO public.customer_status_history (customer_id, status, started_at, ended_at, changed_by)
SELECT c.id, 'new'::public.customer_status, c.imported_at,
       COALESCE(c.status_changed_at, now()), NULL
FROM public.customers c
WHERE c.status <> 'new'::public.customer_status
  AND c.status_changed_at IS NOT NULL
  AND c.status_changed_at > c.imported_at;

INSERT INTO public.customer_status_history (customer_id, status, started_at, ended_at, changed_by)
SELECT c.id, c.status, COALESCE(c.status_changed_at, c.imported_at), NULL, c.status_changed_by
FROM public.customers c;

-- 3) Trigger to maintain history going forward
CREATE OR REPLACE FUNCTION public.record_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.customer_status_history(customer_id, status, started_at, changed_by)
    VALUES (NEW.id, NEW.status, COALESCE(NEW.status_changed_at, NEW.imported_at, now()), NEW.status_changed_by);
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.customer_status_history
      SET ended_at = COALESCE(NEW.status_changed_at, now())
    WHERE customer_id = NEW.id AND ended_at IS NULL;
    INSERT INTO public.customer_status_history(customer_id, status, started_at, changed_by)
    VALUES (NEW.id, NEW.status, COALESCE(NEW.status_changed_at, now()), NEW.status_changed_by);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_customer_status_history ON public.customers;
CREATE TRIGGER trg_customer_status_history
  AFTER INSERT OR UPDATE OF status ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.record_status_history();

-- 4) Rewrite sla_violations to accumulate across all history periods
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
    WHERE c.pool::text IN ('activation_request','google_form_activation')
      AND (_country_ids IS NULL OR array_length(_country_ids,1) IS NULL OR c.country_id = ANY(_country_ids))
      AND h.started_at >= p.start_ts
  ),
  calc AS (
    SELECT b.*,
      b.started_at + (b.hours || ' hours')::interval AS deadline
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
      -- pick the current open period if any, else the most recent
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

-- 5) Rewrite sla_violations_count to count customers with any accumulated SLA fine
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
  WHERE c.pool::text IN ('activation_request','google_form_activation')
    AND h.started_at >= p.start_ts
    AND COALESCE(h.ended_at, now()) > h.started_at + (s.hours || ' hours')::interval;
$$;

-- 6) Rewrite sla_team_summary to accumulate fines across history within window
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
    WHERE c.pool::text IN ('activation_request','google_form_activation')
      AND h.started_at >= p.start_ts
  ),
  -- clip overdue interval to [_period_start, _period_end+1)
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
