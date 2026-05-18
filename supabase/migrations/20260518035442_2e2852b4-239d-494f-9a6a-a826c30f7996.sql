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
  SELECT
    (SELECT count(*)::bigint
     FROM public.customer_call_rounds r
     JOIN public.customers c ON c.id = r.customer_id
     WHERE r.call_date >= (_date_from AT TIME ZONE 'UTC')::date
       AND r.call_date <= (_date_to AT TIME ZONE 'UTC')::date
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
  WITH days AS (
    SELECT generate_series(
      (_date_from AT TIME ZONE 'UTC')::date,
      (_date_to AT TIME ZONE 'UTC')::date,
      interval '1 day'
    )::date AS day
  ),
  calls AS (
    SELECT r.call_date AS day, count(*)::bigint AS calls
    FROM public.customer_call_rounds r
    JOIN public.customers c ON c.id = r.customer_id
    WHERE r.call_date >= (_date_from AT TIME ZONE 'UTC')::date
      AND r.call_date <= (_date_to AT TIME ZONE 'UTC')::date
      AND (_country_id IS NULL OR c.country_id = _country_id)
      AND (_pool IS NULL OR c.pool = _pool)
    GROUP BY r.call_date
  ),
  acts AS (
    SELECT c.activation_date AS day, count(*)::bigint AS activations
    FROM public.customers c
    WHERE c.status = 'activated'::public.customer_status
      AND c.activation_date IS NOT NULL
      AND c.activation_date >= (_date_from AT TIME ZONE 'UTC')::date
      AND c.activation_date <= (_date_to AT TIME ZONE 'UTC')::date
      AND (_country_id IS NULL OR c.country_id = _country_id)
      AND (_pool IS NULL OR c.pool = _pool)
    GROUP BY c.activation_date
  )
  SELECT d.day, coalesce(c.calls, 0)::bigint, coalesce(a.activations, 0)::bigint
  FROM days d
  LEFT JOIN calls c ON c.day = d.day
  LEFT JOIN acts a ON a.day = d.day
  ORDER BY d.day;
$function$;

CREATE OR REPLACE FUNCTION public.stats_country_activated(
  _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _country_id uuid DEFAULT NULL::uuid,
  _pool public.customer_pool DEFAULT NULL::public.customer_pool
)
RETURNS TABLE(country_id uuid, code text, activated bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT co.id, co.code, count(c.id)::bigint
  FROM public.countries co
  LEFT JOIN public.customers c ON c.country_id = co.id
    AND c.status = 'activated'::public.customer_status
    AND (_date_from IS NULL OR c.imported_at >= _date_from)
    AND (_date_to IS NULL OR c.imported_at <= _date_to)
    AND (_pool IS NULL OR c.pool = _pool)
  WHERE co.is_active = true
    AND (_country_id IS NULL OR co.id = _country_id)
  GROUP BY co.id, co.code
  ORDER BY 3 DESC;
$function$;

CREATE OR REPLACE FUNCTION public.stats_channel_summary(
  _country_id uuid DEFAULT NULL::uuid,
  _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  _pool public.customer_pool DEFAULT NULL::public.customer_pool
)
RETURNS TABLE(channel_id uuid, name text, customers bigint, activations bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT ch.id, ch.name,
    count(c.id)::bigint AS customers,
    count(c.id) FILTER (WHERE c.status = 'activated'::public.customer_status)::bigint AS activations
  FROM public.channels ch
  LEFT JOIN public.customers c ON c.channel_id = ch.id
    AND (_country_id IS NULL OR c.country_id = _country_id)
    AND (_date_from IS NULL OR c.imported_at >= _date_from)
    AND (_date_to IS NULL OR c.imported_at <= _date_to)
    AND (_pool IS NULL OR c.pool = _pool)
  WHERE ch.is_active = true
  GROUP BY ch.id, ch.name;
$function$;

CREATE OR REPLACE FUNCTION public.stats_dashboard_summary(
  _date_from timestamp with time zone,
  _date_to timestamp with time zone,
  _year integer,
  _month integer,
  _country_id uuid DEFAULT NULL::uuid,
  _pool public.customer_pool DEFAULT NULL::public.customer_pool
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
  FROM public.stats_totals(_date_from, _date_to, _year, _month, _country_id, _pool) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.day), '[]'::jsonb)
  INTO _daily_calls
  FROM public.stats_daily_calls(_date_from, _date_to, _country_id, _pool) d;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.activated DESC), '[]'::jsonb)
  INTO _country_activated
  FROM public.stats_country_activated(_date_from, _date_to, _country_id, _pool) c;

  SELECT COALESCE(jsonb_agg(to_jsonb(ch) ORDER BY ch.activations DESC, ch.customers DESC), '[]'::jsonb)
  INTO _channel_summary
  FROM public.stats_channel_summary(_country_id, _date_from, _date_to, _pool) ch;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.activated DESC, r.total_calls DESC), '[]'::jsonb)
  INTO _staff_ranking
  FROM public.stats_staff_ranking(_date_from, _date_to, _year, _month, _country_id, CURRENT_DATE) r;

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