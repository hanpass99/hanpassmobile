-- Remove older overloaded RPC signatures that make REST calls ambiguous
DROP FUNCTION IF EXISTS public.stats_dashboard_summary(timestamp with time zone, timestamp with time zone, integer, integer, uuid);
DROP FUNCTION IF EXISTS public.stats_status_counts(uuid);
DROP FUNCTION IF EXISTS public.stats_call_completed(timestamp with time zone, timestamp with time zone, uuid);

-- Status counts must use the same filter basis as customer search
CREATE OR REPLACE FUNCTION public.stats_status_counts(
  _country_id uuid DEFAULT NULL::uuid,
  _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _pool customer_pool DEFAULT NULL::customer_pool
)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT c.status::text, count(*)::bigint
  FROM public.customers c
  WHERE (_country_id IS NULL OR c.country_id = _country_id)
    AND (_date_from IS NULL OR c.imported_at >= _date_from)
    AND (_date_to IS NULL OR c.imported_at <= _date_to)
    AND (_pool IS NULL OR c.pool = _pool)
  GROUP BY c.status;
$function$;

-- Call completed must use the same country/pool filter basis as dashboard/customer navigation
CREATE OR REPLACE FUNCTION public.stats_call_completed(
  _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _country_id uuid DEFAULT NULL::uuid,
  _pool customer_pool DEFAULT NULL::customer_pool
)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT count(*)::bigint
  FROM public.customer_call_rounds r
  JOIN public.customers c ON c.id = r.customer_id
  WHERE (_date_from IS NULL OR r.call_date >= (_date_from AT TIME ZONE 'UTC')::date)
    AND (_date_to IS NULL OR r.call_date <= (_date_to AT TIME ZONE 'UTC')::date)
    AND (_country_id IS NULL OR c.country_id = _country_id)
    AND (_pool IS NULL OR c.pool = _pool);
$function$;

-- Single unambiguous dashboard summary RPC
CREATE OR REPLACE FUNCTION public.stats_dashboard_summary(
  _date_from timestamp with time zone,
  _date_to timestamp with time zone,
  _year integer,
  _month integer,
  _country_id uuid DEFAULT NULL::uuid,
  _pool customer_pool DEFAULT NULL::customer_pool
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  _status_counts jsonb;
  _totals jsonb;
  _daily_calls jsonb;
  _country_activated jsonb;
  _channel_summary jsonb;
  _staff_ranking jsonb;
  _call_completed bigint;
BEGIN
  SELECT COALESCE(jsonb_object_agg(s.status, s.cnt), '{}'::jsonb)
  INTO _status_counts
  FROM public.stats_status_counts(_country_id, _date_from, _date_to, _pool) s;

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

  _call_completed := public.stats_call_completed(_date_from, _date_to, _country_id, _pool);

  RETURN jsonb_build_object(
    'status_counts', _status_counts,
    'totals', _totals,
    'daily_calls', _daily_calls,
    'country_activated', _country_activated,
    'channel_summary', _channel_summary,
    'staff_ranking', _staff_ranking,
    'call_completed', _call_completed
  );
END
$function$;