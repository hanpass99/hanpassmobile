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
  _status_changed boolean := false;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT (_status IS NOT NULL AND _status IS DISTINCT FROM status)
    INTO _status_changed
  FROM public.customers WHERE id = _customer_id;

  UPDATE public.customers
  SET
    name   = COALESCE(_name, name),
    notes  = COALESCE(_notes, notes),
    status = COALESCE(_status, status),
    status_changed_at = CASE WHEN _status_changed THEN now() ELSE status_changed_at END,
    status_changed_by = CASE WHEN _status_changed THEN uid  ELSE status_changed_by END,
    assigned_to = CASE
      WHEN _status_changed AND _status <> 'new'::public.customer_status THEN uid
      ELSE assigned_to
    END,
    updated_at = now()
  WHERE id = _customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer not found';
  END IF;

  RETURN _customer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_update_customer_basic(uuid, text, public.customer_status, text) TO authenticated;