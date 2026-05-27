
CREATE OR REPLACE FUNCTION public.stats_staff_call_completed(
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _country_id uuid DEFAULT NULL
)
RETURNS TABLE(user_id uuid, call_completed bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT r.staff_id AS user_id,
         COALESCE(SUM(r.round), 0)::bigint AS call_completed
  FROM public.customer_call_rounds r
  JOIN public.customers c ON c.id = r.customer_id
  WHERE (_date_from IS NULL OR r.call_date >= _date_from::date)
    AND (_date_to IS NULL OR r.call_date <= _date_to::date)
    AND (_country_id IS NULL OR c.country_id = _country_id)
  GROUP BY r.staff_id;
$$;
