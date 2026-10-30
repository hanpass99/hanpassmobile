CREATE OR REPLACE FUNCTION public.customer_country_filter_options()
RETURNS TABLE(id uuid, code text, name_ko text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $function$
  SELECT co.id, co.code, co.name_ko
  FROM public.countries co
  WHERE EXISTS (SELECT 1 FROM public.customers c WHERE c.country_id = co.id)
  ORDER BY co.code;
$function$;
REVOKE ALL ON FUNCTION public.customer_country_filter_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_country_filter_options() TO authenticated, service_role;