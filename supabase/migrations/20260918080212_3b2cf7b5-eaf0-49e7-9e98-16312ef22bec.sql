
REVOKE EXECUTE ON FUNCTION public.set_own_country(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_hanpass_company(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_company(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_own_country(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_hanpass_company(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_company(uuid) TO authenticated;
