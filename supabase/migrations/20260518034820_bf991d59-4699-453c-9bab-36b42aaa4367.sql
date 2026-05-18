DROP FUNCTION IF EXISTS public.stats_staff_ranking(timestamp with time zone, timestamp with time zone, integer, integer, uuid);

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
  WITH calls AS (
    SELECT r.staff_id, count(*)::bigint AS cnt
    FROM public.customer_call_rounds r
    WHERE r.call_date >= (_date_from AT TIME ZONE 'UTC')::date
      AND r.call_date <= (_date_to AT TIME ZONE 'UTC')::date
      AND (_country_id IS NULL OR EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = r.customer_id AND c.country_id = _country_id
      ))
    GROUP BY r.staff_id
  ),
  acts AS (
    SELECT c.assigned_to, count(*)::bigint AS cnt
    FROM public.customers c
    WHERE c.status = 'activated'::public.customer_status
      AND (_country_id IS NULL OR c.country_id = _country_id)
      AND (_date_from IS NULL OR c.updated_at >= _date_from)
      AND (_date_to IS NULL OR c.updated_at <= _date_to)
    GROUP BY c.assigned_to
  )
  SELECT p.id, p.display_name,
    coalesce(ca.cnt, 0), coalesce(ac.cnt, 0),
    coalesce(t.activation_target, 0),
    COALESCE(att.status::text, 'present') AS attendance
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'staff'::public.app_role
  LEFT JOIN calls ca ON ca.staff_id = p.id
  LEFT JOIN acts ac ON ac.assigned_to = p.id
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