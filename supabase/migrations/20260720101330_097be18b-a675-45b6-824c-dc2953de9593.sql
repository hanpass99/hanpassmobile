CREATE OR REPLACE FUNCTION public.staff_update_customer_basic(
  _customer_id uuid,
  _name text DEFAULT NULL,
  _status public.customer_status DEFAULT NULL,
  _notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  _current_status public.customer_status;
  _assigned_to uuid;
  _country_id uuid;
  _pool public.customer_pool;
  _status_changed boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT c.status, c.assigned_to, c.country_id, c.pool
    INTO _current_status, _assigned_to, _country_id, _pool
  FROM public.customers c
  WHERE c.id = _customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found';
  END IF;

  IF NOT (
    public.has_role(uid, 'admin'::public.app_role)
    OR _assigned_to = uid
    OR (_country_id IS NOT NULL AND _country_id = ANY(public.current_user_countries()))
    OR EXISTS (
      SELECT 1
      FROM public.phone_call_logs pcl
      WHERE pcl.customer_id = _customer_id
        AND pcl.staff_id = uid
    )
  ) THEN
    RAISE EXCEPTION '이 고객을 수정할 권한이 없습니다';
  END IF;

  IF _pool = 'new_signup'::public.customer_pool
     AND NOT (public.has_role(uid, 'admin'::public.app_role) OR public.can_access_new_signup(uid)) THEN
    RAISE EXCEPTION '이 고객을 수정할 권한이 없습니다';
  END IF;

  _status_changed := _status IS NOT NULL AND _status IS DISTINCT FROM _current_status;

  UPDATE public.customers
  SET
    name = CASE
      WHEN _name IS NOT NULL AND btrim(_name) <> '' THEN btrim(_name)
      ELSE name
    END,
    notes = CASE
      WHEN _notes IS NOT NULL THEN NULLIF(_notes, '')
      ELSE notes
    END,
    status = COALESCE(_status, status),
    activation_date = CASE
      WHEN _status_changed AND _status = 'activated'::public.customer_status THEN COALESCE(activation_date, CURRENT_DATE)
      ELSE activation_date
    END,
    status_changed_at = CASE WHEN _status_changed THEN now() ELSE status_changed_at END,
    status_changed_by = CASE WHEN _status_changed THEN uid ELSE status_changed_by END,
    assigned_to = CASE
      WHEN _status_changed AND _status = 'new'::public.customer_status THEN NULL
      WHEN _status_changed AND _status <> 'new'::public.customer_status THEN uid
      ELSE assigned_to
    END,
    updated_at = now()
  WHERE id = _customer_id;

  RETURN _customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_update_customer_basic(uuid, text, public.customer_status, text) TO authenticated;