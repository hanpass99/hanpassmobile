CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE TYPE public.app_role AS ENUM ('admin','staff','hanpass_staff');
CREATE TYPE public.customer_pool AS ENUM ('existing','new_signup','prepaid','activation_request','friend_referral','prepaid_charge','one_year_activation','google_form_activation','google_form_activation_inter','qr_activation','loan_borrower');
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb DEFAULT '{}',raw_app_meta_data jsonb DEFAULT '{}');
CREATE TABLE public.countries(id uuid PRIMARY KEY, is_active boolean DEFAULT true);
CREATE TABLE public.profiles(id uuid PRIMARY KEY,display_name text,department text,company text DEFAULT '한패스 모바일',is_active boolean,approval_status text,country_id uuid,can_access_new_signup boolean DEFAULT false,can_access_telegram boolean DEFAULT false,updated_at timestamptz DEFAULT now());
CREATE TABLE public.user_roles(user_id uuid,role public.app_role,UNIQUE(user_id,role));
CREATE TABLE public.profile_countries(user_id uuid,country_id uuid,UNIQUE(user_id,country_id));
CREATE TABLE public.customers(id uuid PRIMARY KEY,country_id uuid,assigned_to uuid,pool public.customer_pool);
CREATE TABLE public.telegram_chats(id uuid PRIMARY KEY);
CREATE TABLE public.telegram_messages(id uuid PRIMARY KEY,direction text,sent_by uuid);
CREATE TABLE public.loan_borrowers(id uuid PRIMARY KEY);
CREATE TABLE public.google_form_submissions(id uuid PRIMARY KEY);
CREATE TABLE public.ai_reply_settings(id uuid PRIMARY KEY,enabled boolean);
CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text);
GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public,storage TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.can_access_new_signup(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE((SELECT can_access_new_signup FROM public.profiles WHERE id = _user_id), false)
$function$
;
CREATE OR REPLACE FUNCTION public.current_user_countries()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(country_id), ARRAY[]::uuid[])
  FROM public.profile_countries WHERE user_id = auth.uid()
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
 is_admin_created boolean := COALESCE((NEW.raw_app_meta_data->>'created_by_admin') = 'true', false);
 v_company text := COALESCE(NEW.raw_user_meta_data->>'company', '한패스 모바일');
 v_country uuid; v_has_roles boolean; v_approved boolean;
BEGIN
 IF v_company NOT IN ('한패스', '한패스 모바일') THEN v_company := '한패스 모바일'; END IF;
 BEGIN v_country := NULLIF(NEW.raw_user_meta_data->>'country_id', '')::uuid; EXCEPTION WHEN others THEN v_country := NULL; END;
 IF v_country IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.countries WHERE id = v_country AND is_active) THEN v_country := NULL; END IF;
 SELECT EXISTS (SELECT 1 FROM public.user_roles) INTO v_has_roles;
 v_approved := is_admin_created OR NOT v_has_roles;
 INSERT INTO public.profiles (id, display_name, department, company, is_active, approval_status, country_id)
 VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.raw_user_meta_data->>'department', v_company, v_approved, CASE WHEN v_approved THEN 'approved' ELSE 'pending' END, v_country) ON CONFLICT (id) DO NOTHING;
 IF v_approved AND v_country IS NOT NULL THEN
  INSERT INTO public.profile_countries (user_id, country_id) VALUES (NEW.id, v_country) ON CONFLICT DO NOTHING;
 END IF;
 IF NOT v_has_roles THEN INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
 ELSIF is_admin_created THEN INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff') ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ SELECT public.is_approved_staff(_user_id) AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $function$
;
CREATE OR REPLACE FUNCTION public.is_hanpass_company(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND company = '한패스')
$function$
;
CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_profile_approval_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.approval_status NOT IN ('approved','pending','disabled') THEN
    RAISE EXCEPTION 'invalid approval_status: %', NEW.approval_status;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.validate_profile_company()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.company IS NULL OR NEW.company NOT IN ('한패스', '한패스 모바일') THEN
    RAISE EXCEPTION '소속은 한패스 또는 한패스 모바일이어야 합니다';
  END IF;
  RETURN NEW;
END;
$function$
;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loan_borrowers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_reply_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id));
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "user_roles_read_self" ON public.user_roles FOR SELECT TO authenticated USING (((auth.uid() = user_id) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "countries_read" ON public.countries FOR SELECT TO authenticated USING (true);
CREATE POLICY "countries_admin" ON public.countries FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "profile_countries_read" ON public.profile_countries FOR SELECT TO authenticated USING (true);
CREATE POLICY "profile_countries_admin" ON public.profile_countries FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "tg_chats_select" ON public.telegram_chats FOR SELECT TO authenticated USING (true);
CREATE POLICY "tg_chats_update" ON public.telegram_chats FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can view form submissions" ON public.google_form_submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage form submissions" ON public.google_form_submissions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "tg_chats_delete_admin" ON public.telegram_chats FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "tg_msgs_select" ON public.telegram_messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "tg_msgs_insert_out" ON public.telegram_messages FOR INSERT TO authenticated WITH CHECK (((direction = 'out'::text) AND (sent_by = auth.uid())));
CREATE POLICY "tg_msgs_delete_admin" ON public.telegram_messages FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "tg_msgs_update_own_out" ON public.telegram_messages FOR UPDATE TO authenticated USING (((direction = 'out'::text) AND (sent_by = auth.uid()))) WITH CHECK (((direction = 'out'::text) AND (sent_by = auth.uid())));
CREATE POLICY "ai_settings_all_authenticated" ON public.ai_reply_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "customers_read" ON public.customers FOR SELECT TO authenticated USING (((NOT ( SELECT is_hanpass_company(auth.uid()) AS is_hanpass_company)) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR ((country_id IS NOT NULL) AND (country_id = ANY (( SELECT current_user_countries() AS current_user_countries)::uuid[])))) AND ((pool <> 'new_signup'::customer_pool) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT can_access_new_signup(auth.uid()) AS can_access_new_signup))));
CREATE POLICY "customers_insert" ON public.customers FOR INSERT TO authenticated WITH CHECK (((NOT ( SELECT is_hanpass_company(auth.uid()) AS is_hanpass_company)) AND (auth.uid() IS NOT NULL) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR (assigned_to = auth.uid())) AND ((pool <> 'new_signup'::customer_pool) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT can_access_new_signup(auth.uid()) AS can_access_new_signup))));
CREATE POLICY "customers_update_staff" ON public.customers FOR UPDATE TO authenticated USING (((NOT ( SELECT is_hanpass_company(auth.uid()) AS is_hanpass_company)) AND (auth.uid() IS NOT NULL) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR ((country_id IS NOT NULL) AND (country_id = ANY (( SELECT current_user_countries() AS current_user_countries)::uuid[])))) AND ((pool <> 'new_signup'::customer_pool) OR ( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ( SELECT can_access_new_signup(auth.uid()) AS can_access_new_signup))));
CREATE POLICY "customers_delete_admin" ON public.customers FOR DELETE TO authenticated USING (((NOT ( SELECT is_hanpass_company(auth.uid()) AS is_hanpass_company)) AND ( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role)));
CREATE POLICY "customers_hanpass_select" ON public.customers FOR SELECT TO authenticated USING ((( SELECT is_hanpass_company(auth.uid()) AS is_hanpass_company) AND (pool = ANY (ARRAY['activation_request'::customer_pool, 'qr_activation'::customer_pool, 'friend_referral'::customer_pool, 'prepaid_charge'::customer_pool])) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR ((country_id IS NOT NULL) AND (country_id = ANY (( SELECT current_user_countries() AS current_user_countries)::uuid[]))))));
CREATE POLICY "customers_hanpass_insert" ON public.customers FOR INSERT TO authenticated WITH CHECK ((( SELECT is_hanpass_company(auth.uid()) AS is_hanpass_company) AND (pool = ANY (ARRAY['activation_request'::customer_pool, 'qr_activation'::customer_pool, 'friend_referral'::customer_pool, 'prepaid_charge'::customer_pool])) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ((country_id IS NOT NULL) AND (country_id = ANY (( SELECT current_user_countries() AS current_user_countries)::uuid[]))))));
CREATE POLICY "customers_hanpass_update" ON public.customers FOR UPDATE TO authenticated USING ((( SELECT is_hanpass_company(auth.uid()) AS is_hanpass_company) AND (pool = ANY (ARRAY['activation_request'::customer_pool, 'qr_activation'::customer_pool, 'friend_referral'::customer_pool, 'prepaid_charge'::customer_pool])) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR (assigned_to = ( SELECT auth.uid() AS uid)) OR ((country_id IS NOT NULL) AND (country_id = ANY (( SELECT current_user_countries() AS current_user_countries)::uuid[])))))) WITH CHECK ((( SELECT is_hanpass_company(auth.uid()) AS is_hanpass_company) AND (pool = ANY (ARRAY['activation_request'::customer_pool, 'qr_activation'::customer_pool, 'friend_referral'::customer_pool, 'prepaid_charge'::customer_pool]))));
CREATE POLICY "customers_hanpass_delete" ON public.customers FOR DELETE TO authenticated USING ((( SELECT is_hanpass_company(auth.uid()) AS is_hanpass_company) AND (pool = ANY (ARRAY['activation_request'::customer_pool, 'qr_activation'::customer_pool, 'friend_referral'::customer_pool, 'prepaid_charge'::customer_pool])) AND (( SELECT has_role(auth.uid(), 'admin'::app_role) AS has_role) OR ((country_id IS NOT NULL) AND (country_id = ANY (( SELECT current_user_countries() AS current_user_countries)::uuid[]))))));
CREATE POLICY "countries_read_anon" ON public.countries FOR SELECT TO anon USING (is_active);
CREATE POLICY "Staff can read loan borrowers" ON public.loan_borrowers FOR SELECT TO authenticated USING (true);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY media_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id='telegram-media');
CREATE POLICY media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='telegram-media');
CREATE TRIGGER signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
