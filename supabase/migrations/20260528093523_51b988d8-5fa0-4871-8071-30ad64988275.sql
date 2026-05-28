
-- Drop both existing overloads of search_customers
DROP FUNCTION IF EXISTS public.search_customers(customer_pool, text, uuid, text, text, customer_status, timestamptz, timestamptz, text, text, integer, integer, smallint);
DROP FUNCTION IF EXISTS public.search_customers(customer_pool, text, uuid, text, text, customer_status, timestamptz, timestamptz, text, text, integer, integer, smallint, boolean);

-- Recreate search_customers with _country_ids uuid[] (replacing _country_id)
CREATE OR REPLACE FUNCTION public.search_customers(
  _pool customer_pool DEFAULT NULL,
  _search text DEFAULT NULL,
  _country_ids uuid[] DEFAULT NULL,
  _assigned_to text DEFAULT NULL,
  _assigned_country text DEFAULT NULL,
  _status customer_status DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _sort_key text DEFAULT 'imported_at',
  _sort_dir text DEFAULT 'desc',
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 100,
  _call_round smallint DEFAULT NULL,
  _call_completed boolean DEFAULT false
)
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
        AND (
          $14::boolean = true
          OR ($7::timestamptz IS NULL OR c.imported_at >= $7)
        )
        AND (
          $14::boolean = true
          OR ($8::timestamptz IS NULL OR c.imported_at <= $8)
        )
        AND ($9::smallint IS NULL OR c.call_round = $9)
        AND (
          $14::boolean = false
          OR EXISTS (
            SELECT 1
            FROM public.customer_call_rounds r
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

GRANT EXECUTE ON FUNCTION public.search_customers(customer_pool, text, uuid[], text, text, customer_status, timestamptz, timestamptz, text, text, integer, integer, smallint, boolean) TO authenticated, service_role;

-- Update stats_status_counts to also accept array of countries
DROP FUNCTION IF EXISTS public.stats_status_counts(uuid, timestamptz, timestamptz, customer_pool);

CREATE OR REPLACE FUNCTION public.stats_status_counts(
  _country_ids uuid[] DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _pool customer_pool DEFAULT NULL
)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT c.status::text, count(*)::bigint
  FROM public.customers c
  WHERE (_country_ids IS NULL OR array_length(_country_ids,1) IS NULL OR c.country_id = ANY(_country_ids))
    AND (_date_from IS NULL OR c.imported_at >= _date_from)
    AND (_date_to IS NULL OR c.imported_at <= _date_to)
    AND (_pool IS NULL OR c.pool = _pool)
  GROUP BY c.status;
$function$;

GRANT EXECUTE ON FUNCTION public.stats_status_counts(uuid[], timestamptz, timestamptz, customer_pool) TO authenticated, service_role;
