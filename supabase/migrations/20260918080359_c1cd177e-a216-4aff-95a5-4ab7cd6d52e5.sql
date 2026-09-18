
GRANT SELECT ON public.countries TO anon;
CREATE POLICY countries_read_anon ON public.countries FOR SELECT TO anon USING (is_active);
