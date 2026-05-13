-- 국가 추가 (US, GH, CA — IN/PK는 이미 존재)
INSERT INTO public.countries (code, name_ko, name_en)
SELECT v.code, v.name_ko, v.name_en
FROM (VALUES
  ('US','미국','United States'),
  ('GH','가나','Ghana'),
  ('CA','캐나다','Canada')
) v(code, name_ko, name_en)
WHERE NOT EXISTS (SELECT 1 FROM public.countries c WHERE c.code = v.code);

-- 대용량 검색/필터/정렬 가속용 인덱스
CREATE INDEX IF NOT EXISTS idx_customers_pool_imported ON public.customers(pool, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_country ON public.customers(country_id);
CREATE INDEX IF NOT EXISTS idx_customers_assigned ON public.customers(assigned_to);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_imported_at ON public.customers(imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON public.customers(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_notes_customer ON public.customer_notes(customer_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_customer ON public.call_logs(customer_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_staff_date ON public.call_logs(staff_id, call_date DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_staff_sent ON public.sms_logs(staff_id, sent_at DESC);

-- 엑셀 업로드 시 DB측 대량 중복 체크용 RPC
CREATE OR REPLACE FUNCTION public.customers_existing_phones(_pool customer_pool, _phones text[])
RETURNS TABLE(phone text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT c.phone FROM public.customers c
  WHERE c.pool = _pool AND c.phone = ANY(_phones)
$$;

-- 서버사이드 페이지네이션 검색 RPC
CREATE OR REPLACE FUNCTION public.search_customers(
  _pool customer_pool,
  _search text DEFAULT NULL,
  _country_id uuid DEFAULT NULL,
  _assigned_to text DEFAULT NULL,            -- NULL=all, 'unassigned', or uuid string
  _assigned_country text DEFAULT NULL,       -- NULL=all, 'none', or uuid string
  _status customer_status DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _sort_key text DEFAULT 'imported_at',
  _sort_dir text DEFAULT 'desc',
  _page int DEFAULT 1,
  _page_size int DEFAULT 100
)
RETURNS TABLE (data jsonb, total_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
    ELSE 'b.imported_at'
  END;

  _q := format($f$
    WITH base AS (
      SELECT c.* FROM public.customers c
      LEFT JOIN public.profiles p ON p.id = c.assigned_to
      WHERE c.pool = $1
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
    ),
    counted AS (SELECT count(*) AS n FROM base)
    SELECT to_jsonb(b) AS data, counted.n AS total_count
    FROM base b, counted
    ORDER BY %s %s
    OFFSET %s LIMIT %s
  $f$, _sort_sql, _dir, _offset, _page_size);

  RETURN QUERY EXECUTE _q
    USING _pool, _search, _country_id, _assigned_to, _assigned_country, _status, _date_from, _date_to;
END
$$;

GRANT EXECUTE ON FUNCTION public.customers_existing_phones(customer_pool, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_customers(customer_pool, text, uuid, text, text, customer_status, timestamptz, timestamptz, text, text, int, int) TO authenticated;