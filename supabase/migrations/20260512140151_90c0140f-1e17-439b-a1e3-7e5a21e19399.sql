
-- 1. profile_countries (다대다)
CREATE TABLE IF NOT EXISTS public.profile_countries (
  user_id uuid NOT NULL,
  country_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, country_id)
);
ALTER TABLE public.profile_countries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_countries_read" ON public.profile_countries
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profile_countries_admin" ON public.profile_countries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 기존 단일 국가 데이터 이전
INSERT INTO public.profile_countries (user_id, country_id)
SELECT id, country_id FROM public.profiles WHERE country_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 2. EG, JO 추가
INSERT INTO public.countries (code, name_ko, name_en) VALUES
  ('EG', '이집트', 'Egypt'),
  ('JO', '요르단', 'Jordan')
ON CONFLICT DO NOTHING;

-- 3. 프로필 사진
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- avatars 버킷
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_user_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_user_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_user_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 4. 다중 국가 함수
CREATE OR REPLACE FUNCTION public.current_user_countries()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(country_id), ARRAY[]::uuid[])
  FROM public.profile_countries WHERE user_id = auth.uid()
$$;

-- 5. RLS 정책 갱신 (customers)
DROP POLICY IF EXISTS customers_read ON public.customers;
CREATE POLICY customers_read ON public.customers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR assigned_to = auth.uid()
    OR (country_id IS NOT NULL AND country_id = ANY(public.current_user_countries()))
  );

DROP POLICY IF EXISTS notes_read ON public.customer_notes;
CREATE POLICY notes_read ON public.customer_notes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_notes.customer_id
        AND (c.assigned_to = auth.uid()
             OR (c.country_id IS NOT NULL AND c.country_id = ANY(public.current_user_countries())))
    )
  );

DROP POLICY IF EXISTS notes_insert ON public.customer_notes;
CREATE POLICY notes_insert ON public.customer_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid() AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = customer_notes.customer_id
          AND (c.assigned_to = auth.uid()
               OR (c.country_id IS NOT NULL AND c.country_id = ANY(public.current_user_countries())))
      )
    )
  );

DROP POLICY IF EXISTS call_logs_read ON public.call_logs;
CREATE POLICY call_logs_read ON public.call_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR staff_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = call_logs.customer_id
        AND c.country_id IS NOT NULL
        AND c.country_id = ANY(public.current_user_countries())
    )
  );

-- 6. 미처리 시 담당자 미배정
CREATE OR REPLACE FUNCTION public.unassign_on_new_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'new'::customer_status THEN
    NEW.assigned_to := NULL;
  END IF;
  RETURN NEW;
END $$;

-- 기존 auto_assign 트리거가 new로 바뀔 때도 할당해버리지 않도록 수정
CREATE OR REPLACE FUNCTION public.auto_assign_on_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status <> 'new'::customer_status
     AND auth.uid() IS NOT NULL THEN
    NEW.assigned_to := auth.uid();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_unassign_on_new ON public.customers;
CREATE TRIGGER trg_unassign_on_new
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.unassign_on_new_status();

-- 7. Realtime
ALTER TABLE public.customers REPLICA IDENTITY FULL;
ALTER TABLE public.customer_notes REPLICA IDENTITY FULL;
ALTER TABLE public.call_logs REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customers;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_notes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
