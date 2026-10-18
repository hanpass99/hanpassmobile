-- Only trusted server code may toggle active state, so disabling always includes an Auth ban.
CREATE OR REPLACE FUNCTION public.admin_set_profile_active(_user_id uuid, _active boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF COALESCE(auth.role(), '') <> 'service_role' THEN RAISE EXCEPTION 'forbidden'; END IF;
 UPDATE public.profiles SET is_active = _active, approval_status = CASE WHEN _active THEN 'approved' ELSE 'disabled' END, updated_at = now() WHERE id = _user_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_active(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_active(uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.protect_profile_access_fields() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') AND
 (NEW.approval_status IS DISTINCT FROM OLD.approval_status OR NEW.is_active IS DISTINCT FROM OLD.is_active OR
 (NEW.country_id IS DISTINCT FROM OLD.country_id AND NOT (OLD.country_id IS NULL AND public.is_approved_staff(auth.uid()) AND EXISTS (SELECT 1 FROM public.profile_countries WHERE user_id=auth.uid() AND country_id=NEW.country_id))) OR
 NEW.company IS DISTINCT FROM OLD.company OR NEW.can_access_new_signup IS DISTINCT FROM OLD.can_access_new_signup OR NEW.can_access_telegram IS DISTINCT FROM OLD.can_access_telegram) THEN RAISE EXCEPTION 'forbidden'; END IF;
 RETURN NEW;
END $$;

-- These RPCs are SECURITY DEFINER, so RLS alone cannot protect them.
DO $$ DECLARE r record; v_definition text; BEGIN
 FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('set_own_country','set_staff_attendance','staff_update_customer_basic','acquire_telegram_reply_lock','stats_hanpass_dashboard') LOOP
  v_definition := pg_get_functiondef(r.oid);
  v_definition := regexp_replace(v_definition, '\mBEGIN\M', 'BEGIN IF auth.role() IS DISTINCT FROM ''service_role'' AND NOT public.is_approved_staff(auth.uid()) THEN RAISE EXCEPTION ''staff_approval_required''; END IF;', 'i');
  EXECUTE v_definition;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.match_ai_faq(query_embedding public.vector, match_count integer DEFAULT 5)
RETURNS TABLE(id uuid, category text, question_examples text[], answer_uz text, answer_ru text, similarity double precision)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT f.id,f.category,f.question_examples,f.answer_uz,f.answer_ru,1-(f.embedding <=> query_embedding) AS similarity
 FROM public.ai_faq_entries f
 WHERE (auth.role()='service_role' OR public.is_approved_staff(auth.uid())) AND f.is_active=true AND f.embedding IS NOT NULL
 ORDER BY f.embedding <=> query_embedding LIMIT match_count;
$$;