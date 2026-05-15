
-- 1) Extend trigger: also record a call on status change to non-new
CREATE OR REPLACE FUNCTION public.record_call_round()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _round smallint;
  _staff uuid;
BEGIN
  -- Case A: call_round was set or changed
  IF NEW.call_round IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.call_round IS DISTINCT FROM OLD.call_round)
     AND auth.uid() IS NOT NULL THEN
    INSERT INTO public.customer_call_rounds (customer_id, staff_id, round, call_date)
    VALUES (NEW.id, auth.uid(), NEW.call_round, CURRENT_DATE)
    ON CONFLICT (customer_id, call_date)
    DO UPDATE SET round = EXCLUDED.round, staff_id = EXCLUDED.staff_id, updated_at = now();
    RETURN NEW;
  END IF;

  -- Case B: status changed to a non-'new' value → count as a call for the day
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'new'::customer_status
     AND auth.uid() IS NOT NULL THEN
    _round := COALESCE(NEW.call_round, 1);
    INSERT INTO public.customer_call_rounds (customer_id, staff_id, round, call_date)
    VALUES (NEW.id, auth.uid(), _round, CURRENT_DATE)
    ON CONFLICT (customer_id, call_date)
    DO UPDATE SET staff_id = EXCLUDED.staff_id, updated_at = now();
  END IF;

  RETURN NEW;
END $function$;

-- 2) Backfill historical call activity from existing customers (status != 'new')
INSERT INTO public.customer_call_rounds (customer_id, staff_id, round, call_date, created_at, updated_at)
SELECT c.id,
       COALESCE(c.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid),
       COALESCE(c.call_round, 1)::smallint,
       (c.updated_at AT TIME ZONE 'UTC')::date,
       c.updated_at,
       c.updated_at
FROM public.customers c
WHERE c.status <> 'new'::customer_status
  AND c.assigned_to IS NOT NULL
ON CONFLICT (customer_id, call_date) DO NOTHING;

-- 3) Add _pool to dashboard summary so it can match the customers page filters
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

  _call_completed := public.stats_call_completed(_date_from, _date_to, _country_id);

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
