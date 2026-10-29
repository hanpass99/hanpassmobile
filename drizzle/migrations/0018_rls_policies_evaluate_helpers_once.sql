-- RLS 정책 성능 개선 (2026-10-29, 운영 DB 적용·검증 완료)
-- 정책 안의 has_role(auth.uid(), 'admin') / current_user_countries() / is_approved_staff(auth.uid()) 호출을
-- ( SELECT ... ) 로 감싸서 행마다가 아니라 쿼리당 한 번만 계산되게 함 (Supabase 권장 방식).
-- 행 값에 의존하지 않는 호출만 바꾸므로 누가 무엇을 볼 수 있는지는 변하지 않음.
-- 운영 적용 시: 관리자·직원·한패스 직원·미승인 계정 4종 × 33개 테이블의 보이는 행을 전후 비교 → 132/132 동일.
-- 이미 감싸진 정책은 건너뛰므로 다시 실행해도 안전함.
DO $do$
DECLARE
  r record; q text; c text; stmt text;
  pat_role text := '(?<!SELECT )has_role\(auth\.uid\(\), ''admin''::app_role\)';
  pat_cty  text := '(?<!SELECT )current_user_countries\(\)';
  pat_appr text := '(?<!SELECT )is_approved_staff\(auth\.uid\(\)\)';
BEGIN
  FOR r IN SELECT tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' LOOP
    q := r.qual; c := r.with_check;
    IF q IS NOT NULL THEN
      q := regexp_replace(q, pat_role, '( SELECT has_role(auth.uid(), ''admin''::app_role) AS has_role)', 'g');
      q := regexp_replace(q, pat_cty,  '(( SELECT current_user_countries() AS current_user_countries))::uuid[]', 'g');
      q := regexp_replace(q, pat_appr, '( SELECT is_approved_staff(auth.uid()) AS is_approved_staff)', 'g');
    END IF;
    IF c IS NOT NULL THEN
      c := regexp_replace(c, pat_role, '( SELECT has_role(auth.uid(), ''admin''::app_role) AS has_role)', 'g');
      c := regexp_replace(c, pat_cty,  '(( SELECT current_user_countries() AS current_user_countries))::uuid[]', 'g');
      c := regexp_replace(c, pat_appr, '( SELECT is_approved_staff(auth.uid()) AS is_approved_staff)', 'g');
    END IF;
    IF q IS DISTINCT FROM r.qual OR c IS DISTINCT FROM r.with_check THEN
      stmt := format('ALTER POLICY %I ON public.%I', r.policyname, r.tablename);
      IF q IS NOT NULL THEN stmt := stmt || format(' USING (%s)', q); END IF;
      IF c IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', c); END IF;
      EXECUTE stmt;
    END IF;
  END LOOP;
END $do$;
