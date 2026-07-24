
-- Daily call quota policy: staff must make >= 50 calls per day (from phone_call_logs),
-- else 30,000 KRW fine. Admin can waive per day (or mark 'absent') via toggle.

CREATE TABLE IF NOT EXISTS public.sla_call_fine_waivers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fine_date date NOT NULL,
  admin_id uuid REFERENCES auth.users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, fine_date)
);

GRANT SELECT ON public.sla_call_fine_waivers TO authenticated;
GRANT ALL ON public.sla_call_fine_waivers TO service_role;

ALTER TABLE public.sla_call_fine_waivers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call fine waivers admin manage"
ON public.sla_call_fine_waivers FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "call fine waivers self read"
ON public.sla_call_fine_waivers FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- Per-staff daily call fine report
CREATE OR REPLACE FUNCTION public.sla_staff_call_fines(
  _period_start date,
  _period_end date,
  _threshold int DEFAULT 50,
  _fine int DEFAULT 30000
)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  days_evaluated int,
  days_absent int,
  days_waived int,
  days_under int,
  days_fined int,
  total_calls bigint,
  total_fine bigint,
  today_calls bigint,
  today_fined boolean,
  today_waived boolean,
  today_absent boolean
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH days AS (
    SELECT generate_series(_period_start, LEAST(_period_end, CURRENT_DATE), interval '1 day')::date AS d
  ),
  staff AS (
    SELECT p.id, p.display_name
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'staff'::public.app_role
    WHERE p.is_active = true
  ),
  matrix AS (
    SELECT s.id AS user_id, s.display_name, d.d AS day
    FROM staff s CROSS JOIN days d
  ),
  calls AS (
    SELECT l.staff_id,
           ((l.started_at AT TIME ZONE 'Asia/Seoul')::date) AS day,
           count(*)::bigint AS cnt
    FROM public.phone_call_logs l
    WHERE l.staff_id IS NOT NULL
      AND ((l.started_at AT TIME ZONE 'Asia/Seoul')::date)
          BETWEEN _period_start AND LEAST(_period_end, CURRENT_DATE)
    GROUP BY 1, 2
  ),
  att AS (
    SELECT a.user_id, a.attendance_date AS day, a.status::text AS status
    FROM public.staff_attendance a
    WHERE a.attendance_date BETWEEN _period_start AND LEAST(_period_end, CURRENT_DATE)
  ),
  waive AS (
    SELECT w.user_id, w.fine_date AS day
    FROM public.sla_call_fine_waivers w
    WHERE w.fine_date BETWEEN _period_start AND LEAST(_period_end, CURRENT_DATE)
  ),
  joined AS (
    SELECT m.user_id, m.display_name, m.day,
      COALESCE(c.cnt, 0) AS calls,
      (a.status IS NOT NULL AND a.status <> 'present') AS is_absent,
      (w.user_id IS NOT NULL) AS is_waived
    FROM matrix m
    LEFT JOIN calls c ON c.staff_id = m.user_id AND c.day = m.day
    LEFT JOIN att a ON a.user_id = m.user_id AND a.day = m.day
    LEFT JOIN waive w ON w.user_id = m.user_id AND w.day = m.day
  ),
  scored AS (
    SELECT *,
      (NOT is_absent AND NOT is_waived AND calls < _threshold) AS is_fined
    FROM joined
  )
  SELECT
    j.user_id,
    j.display_name,
    count(*)::int AS days_evaluated,
    count(*) FILTER (WHERE is_absent)::int AS days_absent,
    count(*) FILTER (WHERE is_waived AND NOT is_absent)::int AS days_waived,
    count(*) FILTER (WHERE NOT is_absent AND NOT is_waived AND calls < _threshold)::int AS days_under,
    count(*) FILTER (WHERE is_fined)::int AS days_fined,
    COALESCE(SUM(calls), 0)::bigint AS total_calls,
    (count(*) FILTER (WHERE is_fined) * _fine)::bigint AS total_fine,
    COALESCE(SUM(CASE WHEN day = CURRENT_DATE THEN calls END), 0)::bigint AS today_calls,
    bool_or(day = CURRENT_DATE AND is_fined) AS today_fined,
    bool_or(day = CURRENT_DATE AND is_waived) AS today_waived,
    bool_or(day = CURRENT_DATE AND is_absent) AS today_absent
  FROM scored j
  GROUP BY j.user_id, j.display_name
  ORDER BY total_fine DESC, j.display_name;
$$;

GRANT EXECUTE ON FUNCTION public.sla_staff_call_fines(date, date, int, int) TO authenticated;

-- Admin toggle waiver for a given (staff, date). Returns true if waived after call, false if cleared.
CREATE OR REPLACE FUNCTION public.admin_sla_toggle_call_waiver(
  _user_id uuid,
  _date date,
  _reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _exists uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id INTO _exists FROM public.sla_call_fine_waivers
   WHERE user_id = _user_id AND fine_date = _date;
  IF _exists IS NOT NULL THEN
    DELETE FROM public.sla_call_fine_waivers WHERE id = _exists;
    RETURN false;
  END IF;
  INSERT INTO public.sla_call_fine_waivers(user_id, fine_date, admin_id, reason)
  VALUES (_user_id, _date, auth.uid(), _reason);
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_sla_toggle_call_waiver(uuid, date, text) TO authenticated;
