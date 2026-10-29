-- 성능 개선 (2026-10-29)
-- 1) 시트 자동 동기화 전역 실행 잠금: 직원 브라우저가 여러 개 열려 있어도
--    같은 시트 동기화는 claim_sync_job 으로 일정 간격에 한 번만 실행됨.
-- 2) 고객 검색(ILIKE '%검색어%')용 트라이그램 인덱스 + search_customers 검색 조건을
--    인덱스를 탈 수 있는 형태로 변경 (결과는 동일).
-- 3) customers 의 완전히 같은 중복 인덱스 제거 (쓰기 속도 개선, 같은 컬럼 인덱스 1개씩은 유지).

CREATE TABLE IF NOT EXISTS public.sync_job_runs (
  job text PRIMARY KEY,
  last_started_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sync_job_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sync_job_runs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.claim_sync_job(_job text, _min_interval_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claimed boolean;
BEGIN
  INSERT INTO public.sync_job_runs AS r (job, last_started_at)
  VALUES (_job, now())
  ON CONFLICT (job) DO UPDATE SET last_started_at = now()
  WHERE r.last_started_at <= now() - make_interval(secs => GREATEST(_min_interval_seconds, 0))
  RETURNING true INTO _claimed;
  RETURN COALESCE(_claimed, false);
END
$$;
REVOKE ALL ON FUNCTION public.claim_sync_job(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_sync_job(text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sync_job(text, integer) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS customers_name_trgm_idx
  ON public.customers USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx
  ON public.customers USING gin (phone extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_email_trgm_idx
  ON public.customers USING gin ((coalesce(email, '')) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_charge_phone_trgm_idx
  ON public.customers USING gin ((coalesce(charge_phone, '')) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS profiles_display_name_trgm_idx
  ON public.profiles USING gin (display_name extensions.gin_trgm_ops);

-- 같은 정의의 인덱스가 2~3개씩 있던 것 정리 (각 컬럼 조합마다 1개는 남김)
--   assigned_to: idx_customers_assigned_to 유지
--   (pool, imported_at DESC): idx_customers_pool_imported 유지
--   country_id: idx_customers_country 유지
DROP INDEX IF EXISTS public.idx_customers_assigned;
DROP INDEX IF EXISTS public.customers_assigned_to_idx;
DROP INDEX IF EXISTS public.customers_pool_imported_at_idx;
DROP INDEX IF EXISTS public.customers_country_id_idx;

CREATE OR REPLACE FUNCTION public.search_customers(_pool customer_pool DEFAULT NULL::customer_pool, _search text DEFAULT NULL::text, _country_ids uuid[] DEFAULT NULL::uuid[], _assigned_to text DEFAULT NULL::text, _assigned_country text DEFAULT NULL::text, _status customer_status DEFAULT NULL::customer_status, _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone, _sort_key text DEFAULT 'imported_at'::text, _sort_dir text DEFAULT 'desc'::text, _page integer DEFAULT 1, _page_size integer DEFAULT 100, _call_round smallint DEFAULT NULL::smallint, _call_completed boolean DEFAULT false)
 RETURNS TABLE(data jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
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
    WHEN 'signup_date' THEN 'b.signup_date'
    ELSE 'b.imported_at'
  END;

  _q := format($f$
    WITH bounds AS (
      SELECT $7::date AS date_from, $8::date AS date_to
    ),
    base AS (
      SELECT c.* FROM public.customers c
      LEFT JOIN public.profiles p ON p.id = c.assigned_to
      CROSS JOIN bounds bd
      WHERE ($1::customer_pool IS NULL OR c.pool = $1)
        AND ($2::text IS NULL OR $2 = '' OR (
              c.name  ILIKE '%%' || $2 || '%%'
           OR c.phone ILIKE '%%' || $2 || '%%'
           OR coalesce(c.email,'')        ILIKE '%%' || $2 || '%%'
           OR coalesce(c.charge_phone,'') ILIKE '%%' || $2 || '%%'
           OR c.assigned_to = ANY (ARRAY(
                SELECT pp.id FROM public.profiles pp
                WHERE pp.display_name ILIKE '%%' || $2 || '%%'
              ))
        ))
        AND ($3::uuid[] IS NULL OR array_length($3::uuid[],1) IS NULL OR c.country_id = ANY($3::uuid[]))
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
        AND ($14::boolean = true OR ($7::timestamptz IS NULL OR c.imported_at >= $7))
        AND ($14::boolean = true OR ($8::timestamptz IS NULL OR c.imported_at <= $8))
        AND (
          $9::smallint IS NULL
          OR ($9 = 0 AND c.call_round IS NULL)
          OR c.call_round = $9
        )
        AND (
          $14::boolean = false
          OR EXISTS (
            SELECT 1 FROM public.customer_call_rounds r
            WHERE r.customer_id = c.id
              AND ($7::timestamptz IS NULL OR r.call_date >= bd.date_from)
              AND ($8::timestamptz IS NULL OR r.call_date <= bd.date_to)
          )
        )
    ),
    counted AS (SELECT count(*) AS n FROM base)
    SELECT to_jsonb(b) AS data, counted.n AS total_count
    FROM base b, counted
    ORDER BY %s %s
    OFFSET %s LIMIT %s
  $f$, _sort_sql, _dir, _offset, _page_size);

  RETURN QUERY EXECUTE _q
    USING _pool, _search, _country_ids, _assigned_to, _assigned_country, _status, _date_from, _date_to, _call_round, _sort_key, _sort_dir, _page, _page_size, _call_completed;
END
$function$;
