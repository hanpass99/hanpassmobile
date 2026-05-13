-- Add targeted indexes for large customer datasets and dashboard aggregations
CREATE INDEX IF NOT EXISTS idx_customers_pool_phone_composite
  ON public.customers (pool, phone);

CREATE INDEX IF NOT EXISTS idx_customers_pool_status_imported
  ON public.customers (pool, status, imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_customers_pool_country_imported
  ON public.customers (pool, country_id, imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_customers_pool_assigned_imported
  ON public.customers (pool, assigned_to, imported_at DESC);

CREATE INDEX IF NOT EXISTS idx_customers_country_status
  ON public.customers (country_id, status);

CREATE INDEX IF NOT EXISTS idx_customers_channel_status
  ON public.customers (channel_id, status);

CREATE INDEX IF NOT EXISTS idx_customers_assigned_status_updated
  ON public.customers (assigned_to, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_logs_date_customer
  ON public.call_logs (call_date DESC, customer_id);

CREATE INDEX IF NOT EXISTS idx_call_logs_staff_date
  ON public.call_logs (staff_id, call_date DESC);

CREATE INDEX IF NOT EXISTS idx_call_logs_customer_date
  ON public.call_logs (customer_id, call_date DESC);

-- One lightweight call for customer tab badges
CREATE OR REPLACE FUNCTION public.customer_pool_counts()
RETURNS TABLE(pool text, cnt bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT c.pool::text, count(*)::bigint
  FROM public.customers c
  GROUP BY c.pool
$$;

-- Bundle dashboard data into one RPC to reduce request overhead and UI stutter
CREATE OR REPLACE FUNCTION public.stats_dashboard_summary(
  _date_from timestamptz,
  _date_to timestamptz,
  _year integer,
  _month integer,
  _country_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  _status_counts jsonb;
  _totals jsonb;
  _daily_calls jsonb;
  _country_activated jsonb;
  _channel_summary jsonb;
  _staff_ranking jsonb;
BEGIN
  SELECT COALESCE(jsonb_object_agg(s.status, s.cnt), '{}'::jsonb)
  INTO _status_counts
  FROM public.stats_status_counts(_country_id) s;

  SELECT COALESCE(to_jsonb(t), '{}'::jsonb)
  INTO _totals
  FROM public.stats_totals(_date_from, _date_to, _year, _month, _country_id) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.day), '[]'::jsonb)
  INTO _daily_calls
  FROM public.stats_daily_calls(_date_from, _date_to, _country_id) d;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.activated DESC), '[]'::jsonb)
  INTO _country_activated
  FROM public.stats_country_activated() c;

  SELECT COALESCE(jsonb_agg(to_jsonb(ch) ORDER BY ch.activations DESC, ch.customers DESC), '[]'::jsonb)
  INTO _channel_summary
  FROM public.stats_channel_summary(_country_id) ch;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.activated DESC, r.total_calls DESC), '[]'::jsonb)
  INTO _staff_ranking
  FROM public.stats_staff_ranking(_date_from, _date_to, _year, _month, _country_id) r;

  RETURN jsonb_build_object(
    'status_counts', _status_counts,
    'totals', _totals,
    'daily_calls', _daily_calls,
    'country_activated', _country_activated,
    'channel_summary', _channel_summary,
    'staff_ranking', _staff_ranking
  );
END
$$;