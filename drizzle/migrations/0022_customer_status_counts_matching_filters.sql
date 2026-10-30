CREATE OR REPLACE FUNCTION public.customer_filtered_status_counts(
  _pool public.customer_pool DEFAULT NULL,
  _search text DEFAULT NULL,
  _country_ids uuid[] DEFAULT NULL,
  _assigned_to text DEFAULT NULL,
  _assigned_country text DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL,
  _call_round smallint DEFAULT NULL
) RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $function$
  SELECT c.status::text, count(*)::bigint
  FROM public.customers c
  LEFT JOIN public.profiles p ON p.id = c.assigned_to
  WHERE (_pool IS NULL OR c.pool = _pool)
    AND (_search IS NULL OR _search = '' OR (
      c.name ILIKE '%' || _search || '%'
      OR c.phone ILIKE '%' || _search || '%'
      OR coalesce(c.email, '') ILIKE '%' || _search || '%'
      OR coalesce(c.charge_phone, '') ILIKE '%' || _search || '%'
      OR c.assigned_to = ANY (ARRAY(SELECT pp.id FROM public.profiles pp WHERE pp.display_name ILIKE '%' || _search || '%'))
    ))
    AND (_country_ids IS NULL OR array_length(_country_ids, 1) IS NULL OR c.country_id = ANY(_country_ids))
    AND (_assigned_to IS NULL OR (_assigned_to = 'unassigned' AND c.assigned_to IS NULL) OR (_assigned_to <> 'unassigned' AND c.assigned_to::text = _assigned_to))
    AND (_assigned_country IS NULL OR (_assigned_country = 'none' AND (c.assigned_to IS NULL OR p.country_id IS NULL)) OR (_assigned_country <> 'none' AND p.country_id::text = _assigned_country))
    AND (_date_from IS NULL OR c.imported_at >= _date_from)
    AND (_date_to IS NULL OR c.imported_at <= _date_to)
    AND (_call_round IS NULL OR (_call_round = 0 AND c.call_round IS NULL) OR c.call_round = _call_round)
  GROUP BY c.status;
$function$;
REVOKE ALL ON FUNCTION public.customer_filtered_status_counts(public.customer_pool, text, uuid[], text, text, timestamptz, timestamptz, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_filtered_status_counts(public.customer_pool, text, uuid[], text, text, timestamptz, timestamptz, smallint) TO authenticated, service_role;