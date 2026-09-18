CREATE OR REPLACE FUNCTION public.stats_hanpass_dashboard(
  _date_from timestamptz,
  _date_to timestamptz,
  _country_ids uuid[] DEFAULT NULL,
  _staff_ids uuid[] DEFAULT NULL,
  _pools text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result jsonb;
  _pool_list text[] := COALESCE(_pools, ARRAY['activation_request','qr_activation','friend_referral','prepaid_charge']);
  _prev_from timestamptz := _date_from - (_date_to - _date_from) - interval '1 millisecond';
  _prev_to timestamptz := _date_from - interval '1 millisecond';
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'admin') OR public.is_hanpass_company(auth.uid())) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH ev AS (
    SELECT DISTINCT ON (h.changed_by, h.customer_id, (h.started_at AT TIME ZONE 'Asia/Seoul')::date)
      h.changed_by AS staff_id,
      h.customer_id,
      (h.started_at AT TIME ZONE 'Asia/Seoul')::date AS d,
      h.status::text AS status,
      h.started_at
    FROM public.customer_status_history h
    JOIN public.customers c ON c.id = h.customer_id
    JOIN public.profiles p ON p.id = h.changed_by
    WHERE h.changed_by IS NOT NULL
      AND p.company = '한패스'
      AND h.started_at >= _date_from AND h.started_at <= _date_to
      AND c.pool::text = ANY(_pool_list)
      AND (_staff_ids IS NULL OR h.changed_by = ANY(_staff_ids))
      AND (_country_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.profile_countries pc
        WHERE pc.user_id = h.changed_by AND pc.country_id = ANY(_country_ids)))
    ORDER BY h.changed_by, h.customer_id, (h.started_at AT TIME ZONE 'Asia/Seoul')::date, h.started_at DESC
  ),
  ev_prev AS (
    SELECT DISTINCT ON (h.changed_by, h.customer_id, (h.started_at AT TIME ZONE 'Asia/Seoul')::date)
      h.changed_by AS staff_id, h.customer_id, h.status::text AS status
    FROM public.customer_status_history h
    JOIN public.customers c ON c.id = h.customer_id
    JOIN public.profiles p ON p.id = h.changed_by
    WHERE h.changed_by IS NOT NULL
      AND p.company = '한패스'
      AND h.started_at >= _prev_from AND h.started_at <= _prev_to
      AND c.pool::text = ANY(_pool_list)
      AND (_staff_ids IS NULL OR h.changed_by = ANY(_staff_ids))
      AND (_country_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.profile_countries pc
        WHERE pc.user_id = h.changed_by AND pc.country_id = ANY(_country_ids)))
    ORDER BY h.changed_by, h.customer_id, (h.started_at AT TIME ZONE 'Asia/Seoul')::date, h.started_at DESC
  ),
  team AS (
    SELECT ev.*, pc.country_id
    FROM ev LEFT JOIN public.profile_countries pc ON pc.user_id = ev.staff_id
  ),
  team_status AS (
    SELECT country_id, jsonb_object_agg(status, cnt) AS sc
    FROM (SELECT country_id, status, COUNT(*) AS cnt FROM team GROUP BY 1, 2) x
    GROUP BY country_id
  ),
  team_agg AS (
    SELECT t.country_id,
           COALESCE(co.code, '—') AS code,
           COUNT(DISTINCT t.staff_id) AS staff,
           COUNT(*) AS handled,
           COUNT(*) FILTER (WHERE t.status IN ('activated','contract_active')) AS activated
    FROM team t LEFT JOIN public.countries co ON co.id = t.country_id
    GROUP BY t.country_id, co.code
  ),
  staff_status AS (
    SELECT staff_id, jsonb_object_agg(status, cnt) AS sc
    FROM (SELECT staff_id, status, COUNT(*) AS cnt FROM ev GROUP BY 1, 2) x
    GROUP BY staff_id
  ),
  staff_agg AS (
    SELECT e.staff_id,
           MAX(p.display_name) AS name,
           COUNT(*) AS handled,
           COUNT(*) FILTER (WHERE e.status IN ('activated','contract_active')) AS activated,
           COUNT(DISTINCT e.customer_id) AS customers,
           COUNT(DISTINCT e.d) AS active_days,
           MAX(e.started_at) AS last_at
    FROM ev e JOIN public.profiles p ON p.id = e.staff_id
    GROUP BY e.staff_id
  ),
  staff_teams AS (
    SELECT pc.user_id, jsonb_agg(co.code ORDER BY co.code) AS teams
    FROM public.profile_countries pc JOIN public.countries co ON co.id = pc.country_id
    GROUP BY pc.user_id
  ),
  daily AS (
    SELECT d, COUNT(*) AS handled,
           COUNT(*) FILTER (WHERE status IN ('activated','contract_active')) AS activated
    FROM ev GROUP BY d
  ),
  status_all AS (SELECT status, COUNT(*) AS cnt FROM ev GROUP BY status),
  heat AS (SELECT staff_id, d, COUNT(*) AS cnt FROM ev GROUP BY staff_id, d),
  recent AS (
    SELECT h.started_at, p.display_name AS staff, c.name AS customer, c.phone,
           co.code, c.pool::text AS pool, h.status::text AS status
    FROM public.customer_status_history h
    JOIN public.customers c ON c.id = h.customer_id
    JOIN public.profiles p ON p.id = h.changed_by
    LEFT JOIN public.countries co ON co.id = c.country_id
    WHERE h.changed_by IS NOT NULL
      AND p.company = '한패스'
      AND h.started_at >= _date_from AND h.started_at <= _date_to
      AND c.pool::text = ANY(_pool_list)
      AND (_staff_ids IS NULL OR h.changed_by = ANY(_staff_ids))
      AND (_country_ids IS NULL OR EXISTS (
        SELECT 1 FROM public.profile_countries pc
        WHERE pc.user_id = h.changed_by AND pc.country_id = ANY(_country_ids)))
    ORDER BY h.started_at DESC
    LIMIT 50
  )
  SELECT jsonb_build_object(
    'totals', (SELECT jsonb_build_object(
        'handled', COUNT(*), 'customers', COUNT(DISTINCT customer_id),
        'activated', COUNT(*) FILTER (WHERE status IN ('activated','contract_active')),
        'staff', COUNT(DISTINCT staff_id)) FROM ev),
    'prev_totals', (SELECT jsonb_build_object(
        'handled', COUNT(*), 'customers', COUNT(DISTINCT customer_id),
        'activated', COUNT(*) FILTER (WHERE status IN ('activated','contract_active'))) FROM ev_prev),
    'by_team', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'country_id', a.country_id, 'code', a.code, 'staff', a.staff,
        'handled', a.handled, 'activated', a.activated,
        'status_counts', COALESCE(ts.sc, '{}'::jsonb)) ORDER BY a.handled DESC)
      FROM team_agg a LEFT JOIN team_status ts ON ts.country_id IS NOT DISTINCT FROM a.country_id), '[]'::jsonb),
    'by_staff', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'staff_id', s.staff_id, 'name', s.name,
        'teams', COALESCE(st.teams, '[]'::jsonb),
        'handled', s.handled, 'activated', s.activated,
        'customers', s.customers, 'active_days', s.active_days,
        'last_at', s.last_at,
        'status_counts', COALESCE(ss.sc, '{}'::jsonb)) ORDER BY s.handled DESC)
      FROM staff_agg s
      LEFT JOIN staff_teams st ON st.user_id = s.staff_id
      LEFT JOIN staff_status ss ON ss.staff_id = s.staff_id), '[]'::jsonb),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'day', d, 'handled', handled, 'activated', activated) ORDER BY d) FROM daily), '[]'::jsonb),
    'status_counts', COALESCE((SELECT jsonb_object_agg(status, cnt) FROM status_all), '{}'::jsonb),
    'heatmap', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'staff_id', staff_id, 'day', d, 'cnt', cnt)) FROM heat), '[]'::jsonb),
    'recent', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'at', started_at, 'staff', staff, 'customer', customer, 'phone', phone,
        'code', code, 'pool', pool, 'status', status) ORDER BY started_at DESC) FROM recent), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.stats_hanpass_dashboard(timestamptz, timestamptz, uuid[], uuid[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stats_hanpass_dashboard(timestamptz, timestamptz, uuid[], uuid[], text[]) TO authenticated;