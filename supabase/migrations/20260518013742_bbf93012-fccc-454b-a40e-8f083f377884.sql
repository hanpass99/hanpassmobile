
-- 1) New status enum value
ALTER TYPE public.customer_status ADD VALUE IF NOT EXISTS 'suspended_number';

-- 2) Attendance enum
DO $$ BEGIN
  CREATE TYPE public.attendance_status AS ENUM (
    'present', 'day_off', 'annual_leave', 'half_day', 'training', 'sick_leave'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Attendance table
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  status public.attendance_status NOT NULL DEFAULT 'present',
  note text,
  set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON public.staff_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_user_date ON public.staff_attendance(user_id, attendance_date);

ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_read ON public.staff_attendance;
CREATE POLICY attendance_read ON public.staff_attendance
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS attendance_insert ON public.staff_attendance;
CREATE POLICY attendance_insert ON public.staff_attendance
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS attendance_update ON public.staff_attendance;
CREATE POLICY attendance_update ON public.staff_attendance
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS attendance_delete ON public.staff_attendance;
CREATE POLICY attendance_delete ON public.staff_attendance
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_staff_attendance_touch ON public.staff_attendance;
CREATE TRIGGER trg_staff_attendance_touch
  BEFORE UPDATE ON public.staff_attendance
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4) Upsert helper (so staff can mark themselves without conflict races)
CREATE OR REPLACE FUNCTION public.set_staff_attendance(
  _user_id uuid,
  _date date,
  _status public.attendance_status,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF _user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO public.staff_attendance(user_id, attendance_date, status, note, set_by)
  VALUES (_user_id, _date, _status, _note, auth.uid())
  ON CONFLICT (user_id, attendance_date)
  DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note,
                set_by = auth.uid(), updated_at = now();
END $$;

-- 5) Today summary
CREATE OR REPLACE FUNCTION public.stats_attendance_summary(_date date DEFAULT CURRENT_DATE)
RETURNS TABLE(status text, cnt bigint)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH active_staff AS (
    SELECT p.id FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'staff'::app_role
    WHERE p.is_active = true
  ),
  resolved AS (
    SELECT s.id,
      COALESCE(a.status::text, 'present') AS status
    FROM active_staff s
    LEFT JOIN public.staff_attendance a
      ON a.user_id = s.id AND a.attendance_date = _date
  )
  SELECT status, count(*)::bigint FROM resolved GROUP BY status;
$$;

-- 6) Update ranking to filter by attendance
CREATE OR REPLACE FUNCTION public.stats_staff_ranking(
  _date_from timestamptz, _date_to timestamptz,
  _year int, _month int,
  _country_id uuid DEFAULT NULL,
  _attendance_date date DEFAULT NULL
)
RETURNS TABLE(user_id uuid, display_name text, total_calls bigint, activated bigint, activation_target integer, attendance text)
LANGUAGE sql STABLE SET search_path = public AS $$
  WITH calls AS (
    SELECT r.staff_id, count(*)::bigint AS cnt
    FROM public.customer_call_rounds r
    WHERE r.call_date >= (_date_from AT TIME ZONE 'UTC')::date
      AND r.call_date <= (_date_to AT TIME ZONE 'UTC')::date
      AND (_country_id IS NULL OR EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = r.customer_id AND c.country_id = _country_id
      ))
    GROUP BY r.staff_id
  ),
  acts AS (
    SELECT c.assigned_to, count(*)::bigint AS cnt
    FROM public.customers c
    WHERE c.status = 'activated'::customer_status
      AND (_country_id IS NULL OR c.country_id = _country_id)
    GROUP BY c.assigned_to
  )
  SELECT p.id, p.display_name,
    coalesce(ca.cnt, 0), coalesce(ac.cnt, 0),
    coalesce(t.activation_target, 0),
    COALESCE(att.status::text, 'present') AS attendance
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id AND ur.role = 'staff'::app_role
  LEFT JOIN calls ca ON ca.staff_id = p.id
  LEFT JOIN acts ac ON ac.assigned_to = p.id
  LEFT JOIN public.targets t ON t.user_id = p.id AND t.year = _year AND t.month = _month
  LEFT JOIN public.staff_attendance att
    ON att.user_id = p.id AND att.attendance_date = COALESCE(_attendance_date, CURRENT_DATE)
  WHERE p.is_active = true
    AND (
      _attendance_date IS NULL
      OR COALESCE(att.status::text, 'present') = 'present'
    )
  ORDER BY p.sort_order NULLS LAST, ac.cnt DESC NULLS LAST, ca.cnt DESC NULLS LAST;
$$;
