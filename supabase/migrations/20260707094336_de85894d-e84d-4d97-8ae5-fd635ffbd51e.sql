
CREATE OR REPLACE FUNCTION public.sla_upcoming_violations(_country_ids uuid[] DEFAULT NULL::uuid[], _within_hours integer DEFAULT 24)
 RETURNS TABLE(customer_id uuid, customer_name text, phone text, country_id uuid, country_code text, status text, since timestamp with time zone, deadline timestamp with time zone, hours_remaining numeric, fine_amount integer, assigned_to uuid)
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH sla AS (
    SELECT * FROM (VALUES
      ('new'::public.customer_status, 24, 5000),
      ('in_progress'::public.customer_status, 48, 3000),
      ('no_answer'::public.customer_status, 48, 5000),
      ('unreachable'::public.customer_status, 48, 5000)
    ) AS v(status, hours, fine_amount)
  ),
  policy AS (SELECT public.sla_policy_start() AS start_ts),
  base AS (
    SELECT c.id, c.name, c.phone, c.country_id, co.code AS country_code, c.status,
      CASE WHEN c.status = 'new'::public.customer_status THEN c.imported_at
           ELSE COALESCE(c.status_changed_at, c.imported_at) END AS since_ts,
      s.hours, s.fine_amount, c.assigned_to
    FROM public.customers c
    JOIN sla s ON s.status = c.status
    LEFT JOIN public.countries co ON co.id = c.country_id
    CROSS JOIN policy p
    WHERE c.pool = 'activation_request'::public.customer_pool
      AND (_country_ids IS NULL OR array_length(_country_ids,1) IS NULL OR c.country_id = ANY(_country_ids))
      AND (CASE WHEN c.status = 'new'::public.customer_status THEN c.imported_at
                ELSE COALESCE(c.status_changed_at, c.imported_at) END) >= p.start_ts
  ),
  calc AS (
    SELECT id, name, phone, country_id, country_code, status::text AS status, since_ts,
      since_ts + (hours || ' hours')::interval AS deadline,
      fine_amount, assigned_to
    FROM base
  )
  SELECT c.id, c.name, c.phone, c.country_id, c.country_code, c.status, c.since_ts, c.deadline,
    ROUND(EXTRACT(EPOCH FROM (c.deadline - now())) / 3600::numeric, 2) AS hours_remaining,
    c.fine_amount, c.assigned_to
  FROM calc c
  WHERE c.deadline > now()
    AND c.deadline <= now() + (_within_hours || ' hours')::interval
  ORDER BY c.deadline ASC;
$function$;
