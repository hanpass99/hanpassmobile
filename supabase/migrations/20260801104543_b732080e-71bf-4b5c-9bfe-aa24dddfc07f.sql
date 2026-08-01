CREATE OR REPLACE FUNCTION public.sla_staff_call_fines(_period_start date, _period_end date, _threshold integer DEFAULT 50, _fine integer DEFAULT 30000, _focus_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(user_id uuid, display_name text, daily_call_goal integer, days_evaluated integer, days_absent integer, days_waived integer, days_under integer, days_fined integer, total_calls bigint, total_fine bigint, focus_calls bigint, focus_fined boolean, focus_waived boolean, focus_absent boolean, today_calls bigint, today_fined boolean, today_waived boolean, today_absent boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH bounds AS (
    SELECT
      GREATEST(_period_start, DATE '2026-07-24') AS eff_start,
      LEAST(_period_end, CURRENT_DATE) AS eff_end
  ),
  days AS (
    SELECT generate_series((SELECT eff_start FROM bounds), (SELECT eff_end FROM bounds), interval '1 day')::date AS d
    WHERE (SELECT eff_start FROM bounds) <= (SELECT eff_end FROM bounds)
  ),
  staff AS (
    SELECT p.id, p.display_name, COALESCE(p.daily_call_goal, _threshold) AS goal
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'staff'::public.app_role
    WHERE p.is_active = true
  ),
  matrix AS (
    SELECT s.id AS user_id, s.display_name, s.goal, d.d AS day
    FROM staff s CROSS JOIN days d
  ),
  calls AS (
    SELECT l.staff_id,
           ((l.started_at AT TIME ZONE 'Asia/Seoul')::date) AS day,
           count(*)::bigint AS cnt
    FROM public.phone_call_logs l
    WHERE l.staff_id IS NOT NULL
      AND ((l.started_at AT TIME ZONE 'Asia/Seoul')::date)
          BETWEEN (SELECT eff_start FROM bounds) AND (SELECT eff_end FROM bounds)
    GROUP BY 1, 2
  ),
  att AS (
    SELECT a.user_id, a.attendance_date AS day, a.status::text AS status
    FROM public.staff_attendance a
    WHERE a.attendance_date BETWEEN (SELECT eff_start FROM bounds) AND (SELECT eff_end FROM bounds)
  ),
  waive AS (
    SELECT w.user_id, w.fine_date AS day
    FROM public.sla_call_fine_waivers w
    WHERE w.fine_date BETWEEN (SELECT eff_start FROM bounds) AND (SELECT eff_end FROM bounds)
  ),
  joined AS (
    SELECT
      m.user_id, m.display_name, m.goal, m.day,
      COALESCE(c.cnt, 0) AS calls,
      (a.status = 'present') AS is_evaluable,
      (a.status IS NULL OR a.status <> 'present') AS is_absent,
      (w.user_id IS NOT NULL) AS is_waived
    FROM matrix m
    LEFT JOIN calls c ON c.staff_id = m.user_id AND c.day = m.day
    LEFT JOIN att a ON a.user_id = m.user_id AND a.day = m.day
    LEFT JOIN waive w ON w.user_id = m.user_id AND w.day = m.day
  ),
  scored AS (
    SELECT
      j.*,
      (j.day < CURRENT_DATE
        AND j.is_evaluable
        AND NOT j.is_waived
        AND j.calls < j.goal) AS fined
    FROM joined j
  )
  SELECT
    s.user_id,
    s.display_name,
    MAX(s.goal)::int AS daily_call_goal,
    COUNT(*) FILTER (WHERE s.is_evaluable)::int AS days_evaluated,
    COUNT(*) FILTER (WHERE s.is_absent)::int AS days_absent,
    COUNT(*) FILTER (WHERE s.is_evaluable AND s.is_waived)::int AS days_waived,
    COUNT(*) FILTER (WHERE s.is_evaluable AND NOT s.is_waived AND s.calls < s.goal)::int AS days_under,
    COUNT(*) FILTER (WHERE s.fined)::int AS days_fined,
    COALESCE(SUM(s.calls) FILTER (WHERE s.is_evaluable), 0)::bigint AS total_calls,
    (COUNT(*) FILTER (WHERE s.fined) * _fine)::bigint AS total_fine,
    COALESCE(SUM(s.calls) FILTER (WHERE s.day = _focus_date AND s.is_evaluable), 0)::bigint AS focus_calls,
    COALESCE(bool_or(s.fined) FILTER (WHERE s.day = _focus_date), false) AS focus_fined,
    COALESCE(bool_or(s.is_waived) FILTER (WHERE s.day = _focus_date AND s.is_evaluable), false) AS focus_waived,
    COALESCE(bool_or(s.is_absent) FILTER (WHERE s.day = _focus_date), false) AS focus_absent,
    COALESCE(SUM(s.calls) FILTER (WHERE s.day = CURRENT_DATE AND s.is_evaluable), 0)::bigint AS today_calls,
    false AS today_fined,
    COALESCE(bool_or(s.is_waived) FILTER (WHERE s.day = CURRENT_DATE AND s.is_evaluable), false) AS today_waived,
    COALESCE(bool_or(s.is_absent) FILTER (WHERE s.day = CURRENT_DATE), false) AS today_absent
  FROM scored s
  GROUP BY s.user_id, s.display_name
  ORDER BY s.display_name;
$function$;