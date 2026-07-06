
-- SLA & team fine system (activation_request pool only)

-- 1) Adjustments table (admin overrides / waives / resets)
CREATE TABLE public.sla_fine_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id uuid REFERENCES public.countries(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('reset','override','waive')),
  amount integer NOT NULL DEFAULT 0,
  reason text,
  admin_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sla_fine_adjustments TO authenticated;
GRANT ALL ON public.sla_fine_adjustments TO service_role;
ALTER TABLE public.sla_fine_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_adj_select_all_auth" ON public.sla_fine_adjustments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sla_adj_admin_all" ON public.sla_fine_adjustments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE TRIGGER trg_sla_adj_touch BEFORE UPDATE ON public.sla_fine_adjustments
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Audit log
CREATE TABLE public.sla_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  country_id uuid REFERENCES public.countries(id) ON DELETE SET NULL,
  adjustment_id uuid,
  admin_id uuid REFERENCES auth.users(id),
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sla_audit_log TO authenticated;
GRANT ALL ON public.sla_audit_log TO service_role;
ALTER TABLE public.sla_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sla_audit_select_all_auth" ON public.sla_audit_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "sla_audit_admin_insert" ON public.sla_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Realtime
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.sla_fine_adjustments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.customers; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 4) Current violations list
CREATE OR REPLACE FUNCTION public.sla_violations(_country_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  customer_id uuid, customer_name text, phone text,
  country_id uuid, country_code text,
  status text, since timestamptz, deadline timestamptz,
  overdue_hours numeric, overdue_days integer,
  daily_fine integer, fine_total integer,
  assigned_to uuid
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH sla AS (
    SELECT * FROM (VALUES
      ('new'::public.customer_status, 24, 5000),
      ('in_progress'::public.customer_status, 48, 3000),
      ('no_answer'::public.customer_status, 48, 5000)
    ) AS v(status, hours, daily_fine)
  ),
  base AS (
    SELECT c.id, c.name, c.phone, c.country_id, co.code AS country_code, c.status,
      CASE WHEN c.status = 'new'::public.customer_status THEN c.imported_at
           ELSE COALESCE(c.status_changed_at, c.imported_at) END AS since_ts,
      s.hours, s.daily_fine, c.assigned_to
    FROM public.customers c
    JOIN sla s ON s.status = c.status
    LEFT JOIN public.countries co ON co.id = c.country_id
    WHERE c.pool = 'activation_request'::public.customer_pool
      AND (_country_ids IS NULL OR array_length(_country_ids,1) IS NULL OR c.country_id = ANY(_country_ids))
  ),
  calc AS (
    SELECT id, name, phone, country_id, country_code, status::text AS status, since_ts,
      since_ts + (hours || ' hours')::interval AS deadline,
      daily_fine, assigned_to
    FROM base
  )
  SELECT id, name, phone, country_id, country_code, status, since_ts, deadline,
    ROUND(GREATEST(0, EXTRACT(EPOCH FROM (now() - deadline)) / 3600)::numeric, 2) AS overdue_hours,
    GREATEST(0, CEIL(EXTRACT(EPOCH FROM (now() - deadline)) / 86400))::int AS overdue_days,
    daily_fine,
    (GREATEST(0, CEIL(EXTRACT(EPOCH FROM (now() - deadline)) / 86400))::int * daily_fine)::int AS fine_total,
    assigned_to
  FROM calc
  WHERE now() > deadline;
$$;

-- 5) Team (country) summary for a period
CREATE OR REPLACE FUNCTION public.sla_team_summary(_period_start date, _period_end date)
RETURNS TABLE (
  country_id uuid, country_code text, country_name text,
  violations_new bigint, violations_in_progress bigint, violations_absent bigint, violations_total bigint,
  gross_fine bigint, adjustments bigint, net_fine bigint
)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH sla AS (
    SELECT * FROM (VALUES
      ('new'::public.customer_status, 24, 5000),
      ('in_progress'::public.customer_status, 48, 3000),
      ('no_answer'::public.customer_status, 48, 5000)
    ) AS v(status, hours, daily_fine)
  ),
  base AS (
    SELECT c.id, c.country_id, c.status,
      (CASE WHEN c.status='new'::public.customer_status THEN c.imported_at
            ELSE COALESCE(c.status_changed_at, c.imported_at) END)
        + (s.hours || ' hours')::interval AS deadline,
      s.daily_fine
    FROM public.customers c
    JOIN sla s ON s.status = c.status
    WHERE c.pool = 'activation_request'::public.customer_pool
  ),
  win AS (
    SELECT id, country_id, status, daily_fine,
      GREATEST(0, CEIL(EXTRACT(EPOCH FROM (
        LEAST(now(), (_period_end + 1)::timestamptz)
        - GREATEST(deadline, _period_start::timestamptz)
      )) / 86400))::int AS days_in_window,
      (now() > deadline) AS is_violating
    FROM base
  ),
  agg AS (
    SELECT country_id,
      count(*) FILTER (WHERE is_violating AND status='new'::public.customer_status) AS v_new,
      count(*) FILTER (WHERE is_violating AND status='in_progress'::public.customer_status) AS v_ip,
      count(*) FILTER (WHERE is_violating AND status='no_answer'::public.customer_status) AS v_ab,
      count(*) FILTER (WHERE is_violating) AS v_total,
      COALESCE(SUM(days_in_window * daily_fine), 0)::bigint AS gross
    FROM win
    GROUP BY country_id
  ),
  adj AS (
    SELECT country_id,
      COALESCE(SUM(CASE WHEN adjustment_type='waive' THEN -amount ELSE 0 END), 0)::bigint AS waive_delta,
      bool_or(adjustment_type = 'reset') AS has_reset,
      MAX(CASE WHEN adjustment_type='override' THEN amount END) AS override_amount
    FROM public.sla_fine_adjustments
    WHERE period_start <= _period_end AND period_end >= _period_start
    GROUP BY country_id
  )
  SELECT co.id, co.code, co.name_ko,
    COALESCE(a.v_new,0), COALESCE(a.v_ip,0), COALESCE(a.v_ab,0), COALESCE(a.v_total,0),
    COALESCE(a.gross,0)::bigint,
    COALESCE(adj.waive_delta,0)::bigint,
    (CASE
      WHEN adj.has_reset THEN 0
      WHEN adj.override_amount IS NOT NULL THEN adj.override_amount::bigint
      ELSE GREATEST(0, COALESCE(a.gross,0) + COALESCE(adj.waive_delta,0))
    END)::bigint AS net_fine
  FROM public.countries co
  LEFT JOIN agg a ON a.country_id = co.id
  LEFT JOIN adj ON adj.country_id = co.id
  WHERE co.is_active = true
    AND (COALESCE(a.v_total,0) > 0 OR COALESCE(a.gross,0) > 0 OR adj.country_id IS NOT NULL)
  ORDER BY net_fine DESC, v_total DESC;
$$;

-- 6) Current violation count (dashboard card)
CREATE OR REPLACE FUNCTION public.sla_violations_count()
RETURNS bigint LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT count(*)::bigint FROM public.sla_violations(NULL);
$$;

-- 7) Admin actions
CREATE OR REPLACE FUNCTION public.admin_sla_reset_fine(_country_id uuid, _period_start date, _period_end date, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.sla_fine_adjustments(country_id, period_start, period_end, adjustment_type, amount, reason, admin_id)
  VALUES (_country_id, _period_start, _period_end, 'reset', 0, _reason, auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.sla_audit_log(action, country_id, adjustment_id, admin_id, details)
  VALUES ('reset', _country_id, _id, auth.uid(),
    jsonb_build_object('period_start',_period_start,'period_end',_period_end,'reason',_reason));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_sla_override_fine(_country_id uuid, _period_start date, _period_end date, _amount integer, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.sla_fine_adjustments(country_id, period_start, period_end, adjustment_type, amount, reason, admin_id)
  VALUES (_country_id, _period_start, _period_end, 'override', GREATEST(0,_amount), _reason, auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.sla_audit_log(action, country_id, adjustment_id, admin_id, details)
  VALUES ('override', _country_id, _id, auth.uid(),
    jsonb_build_object('amount',_amount,'period_start',_period_start,'period_end',_period_end,'reason',_reason));
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_sla_waive_fine(_country_id uuid, _period_start date, _period_end date, _amount integer, _reason text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN RAISE EXCEPTION 'forbidden'; END IF;
  INSERT INTO public.sla_fine_adjustments(country_id, period_start, period_end, adjustment_type, amount, reason, admin_id)
  VALUES (_country_id, _period_start, _period_end, 'waive', GREATEST(0,_amount), _reason, auth.uid())
  RETURNING id INTO _id;
  INSERT INTO public.sla_audit_log(action, country_id, adjustment_id, admin_id, details)
  VALUES ('waive', _country_id, _id, auth.uid(),
    jsonb_build_object('amount',_amount,'period_start',_period_start,'period_end',_period_end,'reason',_reason));
  RETURN _id;
END $$;
