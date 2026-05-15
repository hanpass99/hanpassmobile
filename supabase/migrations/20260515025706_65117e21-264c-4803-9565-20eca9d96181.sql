
-- 1. customers.call_round 컬럼 (1, 2, 3 또는 NULL)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS call_round smallint NULL
  CHECK (call_round IS NULL OR call_round BETWEEN 1 AND 3);

-- 2. customer_call_rounds 일자별 콜 라운드 변경 기록
CREATE TABLE IF NOT EXISTS public.customer_call_rounds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL,
  round smallint NOT NULL CHECK (round BETWEEN 1 AND 3),
  call_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_call_rounds_unique UNIQUE (customer_id, call_date)
);

CREATE INDEX IF NOT EXISTS idx_call_rounds_staff_date ON public.customer_call_rounds (staff_id, call_date);
CREATE INDEX IF NOT EXISTS idx_call_rounds_customer_date ON public.customer_call_rounds (customer_id, call_date);
CREATE INDEX IF NOT EXISTS idx_call_rounds_date ON public.customer_call_rounds (call_date);

ALTER TABLE public.customer_call_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS call_rounds_read ON public.customer_call_rounds;
CREATE POLICY call_rounds_read ON public.customer_call_rounds
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR staff_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_call_rounds.customer_id
        AND (c.assigned_to = auth.uid()
          OR (c.country_id IS NOT NULL AND c.country_id = ANY (public.current_user_countries())))
    )
  );

DROP POLICY IF EXISTS call_rounds_insert ON public.customer_call_rounds;
CREATE POLICY call_rounds_insert ON public.customer_call_rounds
  FOR INSERT TO authenticated
  WITH CHECK (staff_id = auth.uid());

DROP POLICY IF EXISTS call_rounds_update ON public.customer_call_rounds;
CREATE POLICY call_rounds_update ON public.customer_call_rounds
  FOR UPDATE TO authenticated
  USING (staff_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS call_rounds_delete_admin ON public.customer_call_rounds;
CREATE POLICY call_rounds_delete_admin ON public.customer_call_rounds
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. customers.call_round 변경 → 일자별 1건 기록 (UPSERT)
CREATE OR REPLACE FUNCTION public.record_call_round()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.call_round IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.call_round IS DISTINCT FROM OLD.call_round)
     AND auth.uid() IS NOT NULL THEN
    INSERT INTO public.customer_call_rounds (customer_id, staff_id, round, call_date)
    VALUES (NEW.id, auth.uid(), NEW.call_round, CURRENT_DATE)
    ON CONFLICT (customer_id, call_date)
    DO UPDATE SET round = EXCLUDED.round, staff_id = EXCLUDED.staff_id, updated_at = now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_record_call_round ON public.customers;
CREATE TRIGGER trg_record_call_round
AFTER INSERT OR UPDATE OF call_round ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.record_call_round();

-- 4. search_customers RPC: pool nullable + call_round 필터 추가
DROP FUNCTION IF EXISTS public.search_customers(customer_pool, text, uuid, text, text, customer_status, timestamptz, timestamptz, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.search_customers(
  _pool customer_pool DEFAULT NULL,
  _search text DEFAULT NULL,
  _country_id uuid DEFAULT NULL,
  _assigned_to text DEFAULT NULL,
  _assigned_country text DEFAULT NULL,
  _status customer_status DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _sort_key text DEFAULT 'imported_at',
  _sort_dir text DEFAULT 'desc',
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 100,
  _call_round smallint DEFAULT NULL
)
RETURNS TABLE(data jsonb, total_count bigint)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $function$
DECLARE
  _offset int := GREATEST(0, (_page - 1) * _page_size);
  _sort_sql text;
  _dir text := CASE WHEN lower(_sort_dir) = 'asc' THEN 'ASC NULLS LAST' ELSE 'DESC NULLS LAST' END;
  _q text;
BEGIN
  _sort_sql := CASE _sort_key
    WHEN 'name' THEN 'b.name'
    WHEN 'phone' THEN 'b.phone'
    WHEN 'status' THEN 'b.status::text'
    WHEN 'imported_at' THEN 'b.imported_at'
    WHEN 'activation_date' THEN 'b.activation_date'
    WHEN 'application_date' THEN 'b.application_date'
    WHEN 'carrier_plan' THEN 'b.carrier_plan'
    WHEN 'requested_plan' THEN 'b.requested_plan'
    WHEN 'call_round' THEN 'b.call_round'
    ELSE 'b.imported_at'
  END;

  _q := format($f$
    WITH base AS (
      SELECT c.* FROM public.customers c
      LEFT JOIN public.profiles p ON p.id = c.assigned_to
      WHERE ($1::customer_pool IS NULL OR c.pool = $1)
        AND ($2::text IS NULL OR $2 = '' OR (
              c.name  ILIKE '%%' || $2 || '%%'
           OR c.phone ILIKE '%%' || $2 || '%%'
           OR coalesce(c.email,'')        ILIKE '%%' || $2 || '%%'
           OR coalesce(c.charge_phone,'') ILIKE '%%' || $2 || '%%'
        ))
        AND ($3::uuid IS NULL OR c.country_id = $3)
        AND (
          $4::text IS NULL
          OR ($4 = 'unassigned' AND c.assigned_to IS NULL)
          OR ($4 <> 'unassigned' AND c.assigned_to::text = $4)
        )
        AND (
          $5::text IS NULL
          OR ($5 = 'none' AND (c.assigned_to IS NULL OR p.country_id IS NULL))
          OR ($5 <> 'none' AND p.country_id::text = $5)
        )
        AND ($6::customer_status IS NULL OR c.status = $6)
        AND ($7::timestamptz IS NULL OR c.imported_at >= $7)
        AND ($8::timestamptz IS NULL OR c.imported_at <= $8)
        AND ($9::smallint IS NULL OR c.call_round = $9)
    ),
    counted AS (SELECT count(*) AS n FROM base)
    SELECT to_jsonb(b) AS data, counted.n AS total_count
    FROM base b, counted
    ORDER BY %s %s
    OFFSET %s LIMIT %s
  $f$, _sort_sql, _dir, _offset, _page_size);

  RETURN QUERY EXECUTE _q
    USING _pool, _search, _country_id, _assigned_to, _assigned_country, _status, _date_from, _date_to, _call_round;
END
$function$;

-- 5. stats_status_counts: 날짜/풀 인자 추가
CREATE OR REPLACE FUNCTION public.stats_status_counts(
  _country_id uuid DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _pool customer_pool DEFAULT NULL
)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT status::text, count(*)::bigint
  FROM public.customers
  WHERE (_country_id IS NULL OR country_id = _country_id)
    AND (_date_from IS NULL OR imported_at >= _date_from)
    AND (_date_to IS NULL OR imported_at <= _date_to)
    AND (_pool IS NULL OR pool = _pool)
  GROUP BY status;
$$;

-- 6. stats_call_completed: 일자별 distinct (customer, date) 기준
CREATE OR REPLACE FUNCTION public.stats_call_completed(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _country_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)::bigint FROM public.customer_call_rounds r
  WHERE (_date_from IS NULL OR r.call_date >= (_date_from AT TIME ZONE 'UTC')::date)
    AND (_date_to IS NULL OR r.call_date <= (_date_to AT TIME ZONE 'UTC')::date)
    AND (_country_id IS NULL OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = r.customer_id AND c.country_id = _country_id
    ));
$$;

-- 7. stats_dashboard_summary: 날짜/풀 status_counts + call_completed 필드 포함
CREATE OR REPLACE FUNCTION public.stats_dashboard_summary(
  _date_from timestamptz,
  _date_to timestamptz,
  _year integer,
  _month integer,
  _country_id uuid DEFAULT NULL
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
  _call_completed bigint;
BEGIN
  SELECT COALESCE(jsonb_object_agg(s.status, s.cnt), '{}'::jsonb)
  INTO _status_counts
  FROM public.stats_status_counts(_country_id, _date_from, _date_to, NULL) s;

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
$$;

-- 8. stats_staff_ranking: total_calls를 customer_call_rounds 기반으로 (실제 콜 실적)
CREATE OR REPLACE FUNCTION public.stats_staff_ranking(
  _date_from timestamptz,
  _date_to timestamptz,
  _year integer,
  _month integer,
  _country_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, display_name text, total_calls bigint, activated bigint, activation_target integer)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
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
    WHERE c.status = 'activated'::customer_status
      AND (_country_id IS NULL OR c.country_id = _country_id)
    GROUP BY c.assigned_to
  )
  SELECT p.id, p.display_name,
    coalesce(ca.cnt, 0), coalesce(ac.cnt, 0),
    coalesce(t.activation_target, 0)
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'staff'::app_role
  LEFT JOIN calls ca ON ca.staff_id = p.id
  LEFT JOIN acts ac ON ac.assigned_to = p.id
  LEFT JOIN public.targets t ON t.user_id = p.id AND t.year = _year AND t.month = _month
  WHERE p.is_active = true
  ORDER BY ac.cnt DESC NULLS LAST, ca.cnt DESC NULLS LAST;
$$;
