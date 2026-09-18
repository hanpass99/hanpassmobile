CREATE INDEX IF NOT EXISTS customer_status_history_changed_by_started_idx
  ON public.customer_status_history (changed_by, started_at DESC);
CREATE INDEX IF NOT EXISTS customer_status_history_customer_started_idx
  ON public.customer_status_history (customer_id, started_at DESC);

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
  _span interval := _date_to - _date_from;
  _prev_from timestamptz := _date_from - (_date_to - _date_from) - interval '1 millisecond';
  _prev_to timestamptz := _date_from - interval '1 millisecond';
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.is_hanpass_company(auth.uid())) THEN
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
      AND (
        _country_ids IS NULL OR EXISTS (
          SELECT 1 FROM public.profile_countries pc
          WHERE pc.user_id = h.changed_by AND pc.country_id = ANY(_country_ids)
        )
      )
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
      AND (
        _country_ids IS NULL OR EXISTS (
          SELECT 1 FROM public.profile_countries pc
          WHERE pc.user_id = h.changed_by AND pc.country_id = ANY(_country_ids)
        )
      )
    ORDER BY h.changed_by, h.customer_id, (h.started_at AT TIME ZONE 'Asia/Seoul')::date, h.started_at DESC
  ),
  team AS (
    SELECT ev.*, pc.country_id
    FROM ev
    LEFT JOIN public.profile_countries pc ON pc.user_id = ev.staff_id
  )
  SELECT jsonb_build_object(
    'totals', (
      SELECT jsonb_build_object(
        'handled', COUNT(*),
        'customers', COUNT(DISTINCT customer_id),
        'activated', COUNT(*) FILTER (WHERE status IN ('activated','contract_active')),
        'staff', COUNT(DISTINCT staff_id)
      ) FROM ev
    ),
    'prev_totals', (
      SELECT jsonb_build_object(
        'handled', COUNT(*),
        'customers', COUNT(DISTINCT customer_id),
        'activated', COUNT(*) FILTER (WHERE status IN ('activated','contract_active'))
      ) FROM ev_prev
    ),
    'by_team', COALESCE((
      SELECT jsonb_agg(x ORDER BY x->>'handled' IS NULL, (x->>'handled')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'country_id', t.country_id,
          'code', COALESCE(co.code, '—'),
          'staff', COUNT(DISTINCT t.staff_id),
          'handled', COUNT(*),
          'activated', COUNT(*) FILTER (WHERE t.status IN ('activated','contract_active')),
          'status_counts', COALESCE(jsonb_object_agg(s.status, s.cnt) FILTER (WHERE s.status IS NOT NULL), '{}'::jsonb)
        ) AS x
        FROM team t
        LEFT JOIN LATERAL (
          SELECT t2.status, COUNT(*) AS cnt
          FROM team t2
          WHERE t2.country_id IS NOT DISTINCT FROM t.country_id
          GROUP BY t2.status
        ) s ON true
        GROUP BY t.country_id, co.code
      ) q
      LEFT JOIN public.countries co ON false
    ), '[]'::jsonb),
    'by_staff', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'staff_id', a.staff_id,
        'name', a.name,
        'teams', a.teams,
        'handled', a.handled,
        'activated', a.activated,
        'last_at', a.last_at,
        'status_counts', a.status_counts
      ) ORDER BY a.handled DESC)
      FROM (
        SELECT ev.staff_id,
               MAX(p.display_name) AS name,
               COUNT(*) AS handled,
               COUNT(*) FILTER (WHERE ev.status IN ('activated','contract_active')) AS activated,
               MAX(ev.started_at) AS last_at,
               jsonb_object_agg(ev.status, ev.cnt) AS status_counts,
               COALESCE((
                 SELECT jsonb_agg(co.code ORDER BY co.code)
                 FROM public.profile_countries pc
                 JOIN public.countries co ON co.id = pc.country_id
                 WHERE pc.user_id = ev.staff_id
               ), '[]'::jsonb) AS teams
        FROM (
          SELECT staff_id, status, started_at, COUNT(*) OVER (PARTITION BY staff_id, status) AS cnt
          FROM ev
        ) ev
        JOIN public.profiles p ON p.id = ev.staff_id
        GROUP BY ev.staff_id
      ) a
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'day', d, 'handled', handled, 'activated', activated
      ) ORDER BY d)
      FROM (
        SELECT d, COUNT(*) AS handled,
               COUNT(*) FILTER (WHERE status IN ('activated','contract_active')) AS activated
        FROM ev GROUP BY d
      ) q
    ), '[]'::jsonb),
    'status_counts', COALESCE((
      SELECT jsonb_object_agg(status, cnt)
      FROM (SELECT status, COUNT(*) AS cnt FROM ev GROUP BY status) q
    ), '{}'::jsonb),
    'heatmap', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('staff_id', staff_id, 'day', d, 'cnt', cnt))
      FROM (SELECT staff_id, d, COUNT(*) AS cnt FROM ev GROUP BY staff_id, d) q
    ), '[]'::jsonb),
    'recent', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'at', h.started_at,
        'staff', p.display_name,
        'customer', c.name,
        'phone', c.phone,
        'code', co.code,
        'pool', c.pool::text,
        'status', h.status::text
      ) ORDER BY h.started_at DESC)
      FROM public.customer_status_history h
      JOIN public.customers c ON c.id = h.customer_id
      JOIN public.profiles p ON p.id = h.changed_by
      LEFT JOIN public.countries co ON co.id = c.country_id
      WHERE h.changed_by IS NOT NULL
        AND p.company = '한패스'
        AND h.started_at >= _date_from AND h.started_at <= _date_to
        AND c.pool::text = ANY(_pool_list)
        AND (_staff_ids IS NULL OR h.changed_by = ANY(_staff_ids))
        AND (
          _country_ids IS NULL OR EXISTS (
            SELECT 1 FROM public.profile_countries pc
            WHERE pc.user_id = h.changed_by AND pc.country_id = ANY(_country_ids)
          )
        )
      LIMIT 50
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.stats_hanpass_dashboard(timestamptz, timestamptz, uuid[], uuid[], text[]) TO authenticated;