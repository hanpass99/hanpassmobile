REVOKE ALL ON FUNCTION public.staff_update_customer_basic(uuid, text, public.customer_status, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_update_customer_basic(uuid, text, public.customer_status, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_update_customer_basic(uuid, text, public.customer_status, text) TO authenticated;