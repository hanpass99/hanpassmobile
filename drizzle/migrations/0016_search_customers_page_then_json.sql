-- 고객 목록 속도 개선 (2026-10-29)
-- 1) 예전에는 조건에 맞는 고객 전체(전체 탭 2만6천 명)를 JSON 으로 바꾼 뒤 20명만 골랐음.
--    이제 화면에 보일 페이지 행만 고른 다음 JSON 으로 바꿈 (전체 탭 약 320ms → 수십 ms).
-- 2) 정렬 값이 같은 고객(같은 시각에 일괄 등록 등)이 페이지를 넘길 때 중복/누락되지 않도록
--    고객 id 를 마지막 정렬 기준으로 추가.
-- 필터·검색 조건과 총 건수는 그대로.

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
    counted AS (SELECT count(*) AS n FROM base),
    page AS (
      SELECT b.* FROM base b
      ORDER BY %1$s %2$s, b.id
      OFFSET %3$s LIMIT %4$s
    )
    SELECT to_jsonb(b) AS data, counted.n AS total_count
    FROM page b, counted
    ORDER BY %1$s %2$s, b.id
  $f$, _sort_sql, _dir, _offset, _page_size);

  RETURN QUERY EXECUTE _q
    USING _pool, _search, _country_ids, _assigned_to, _assigned_country, _status, _date_from, _date_to, _call_round, _sort_key, _sort_dir, _page, _page_size, _call_completed;
END
$function$;
