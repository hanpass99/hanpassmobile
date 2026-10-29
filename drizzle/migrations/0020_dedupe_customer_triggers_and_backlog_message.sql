-- 고객 테이블 중복 트리거 정리 + 미배정 점검 문구 (2026-10-29, 운영 적용·검증 완료)
-- 같은 함수가 이름만 다르게 두 번 등록돼 있어 고객 저장 때마다 4개 검사가 두 번씩 실행되던 것 제거.
-- 권한 검사(prevent_assigned_to_escalation)는 자동 배정보다 먼저 실행되는 쪽을 남김.
-- 운영 적용 시 직원·관리자 저장 시나리오 11개를 전후 비교 → 결과 동일 (금지 2건 포함).
DROP TRIGGER IF EXISTS trg_auto_assign_status ON public.customers;
DROP TRIGGER IF EXISTS trg_prevent_assigned_to_escalation ON public.customers;
DROP TRIGGER IF EXISTS trg_touch_updated_at_customers ON public.customers;
DROP TRIGGER IF EXISTS trg_unassign_on_new_status ON public.customers;

-- "담당자 미배정"은 오류가 아니라 아직 연락하지 않은 신규 고객 수라는 뜻이 드러나도록 문구만 변경
DO $do$
DECLARE
  def text := pg_get_functiondef('public.run_system_checks'::regproc);
  o1 text := $o$format('최근 7일 신규 고객은 모두 담당자 배정됨 (전체 미배정 %s명)', _n)$o$;
  n1 text := $n$format('최근 7일 신규 고객은 모두 연락 시작됨 (전체 연락 전 신규 고객 %s명)', _n)$n$;
  o2 text := $o$format('최근 7일 담당자 미배정 신규 고객 %s명 (전체 미배정 %s명)', _n2, _n)$o$;
  n2 text := $n$format('아직 아무도 연락하지 않은 신규 고객: 최근 7일 %s명 (전체 %s명) — 첫 상태 변경 시 담당자가 자동 배정됩니다', _n2, _n)$n$;
BEGIN
  IF position(n2 IN def) > 0 THEN RETURN; END IF;
  IF position(o1 IN def) = 0 OR position(o2 IN def) = 0 THEN
    RAISE EXCEPTION 'unassigned message not found — not changed';
  END IF;
  EXECUTE replace(replace(def, o1, n1), o2, n2);
END $do$;
