## 문제

통화 팝업에서 고객 이름을 수정하면 "이 고객을 수정할 권한이 없습니다" 토스트가 나옵니다.

확인 결과: 해당 고객(`ZOKIROVMUKHAMMADKARIM`, 01076532555)은 `assigned_to`와 `country_id`가 모두 `NULL`입니다. 현재 `customers` 테이블의 UPDATE RLS 정책은 아래 중 하나여야 통과합니다:
- 관리자, 또는
- 본인이 담당자(`assigned_to = auth.uid()`), 또는
- 자신의 국가 접근 권한과 일치(`country_id ∈ current_user_countries()`)

이 고객은 세 조건 모두 해당 없음 → 일반 직원이 이름/상태/메모를 저장할 수 없습니다. 구글폼/친구추천 등에서 유입된 미배정·국가 없는 행이 다수라 팝업에서 흔히 재현됩니다.

## 해결 방향

RLS 정책을 전면 완화하지 않고, 팝업에서 필요한 필드(이름·메모·상태)만 안전하게 수정할 수 있는 **SECURITY DEFINER 함수**를 신설합니다. 이미 직원 전화번호 저장에서 사용한 `admin_set_profile_phone` 패턴과 동일한 방식입니다.

### 1) DB 마이그레이션

새 함수 `public.staff_update_customer_basic(_customer_id uuid, _name text, _status customer_status, _notes text)`:
- `SECURITY DEFINER`, `SET search_path = public`
- 호출자가 인증된 사용자여야 함 (`auth.uid() IS NOT NULL`) — 아니면 예외
- 전달된 인자 중 NULL이 아닌 필드만 갱신 (`COALESCE(_name, name)` 방식)
- `status`가 바뀌면 `status_changed_at = now()`, `status_changed_by = auth.uid()` 도 함께 세팅 (기존 트리거와 동일한 컨벤션 유지)
- 반환: 갱신된 행의 `id`
- `GRANT EXECUTE ON FUNCTION ... TO authenticated`

RLS 자체는 그대로 유지 (조회 정책은 변경 없음 — 조회는 이미 팝업 컨텍스트에서 열어놓은 상태).

### 2) 프론트엔드 수정

파일: `src/components/CallLogPopupProvider.tsx`

- 저장 시 `customers` 테이블 직접 update 대신 `supabase.rpc('staff_update_customer_basic', { _customer_id, _name, _status, _notes })` 호출로 교체.
- 에러 처리: RPC가 예외를 던지면 그 메시지를 토스트로 표시.
- 성공 시 기존과 동일하게 `phone_call_logs`(이름/메모/상태) 업데이트 및 리스트 refetch.

### 3) 검증

- 미배정·국가 없는 고객에서 팝업 열어 이름 변경 → 정상 저장
- 상태 변경 시 담당자 자동 배정 트리거가 계속 작동하는지 확인
- 관리자가 아닌 일반 직원 계정으로도 재현 테스트

## 영향 범위

- 신규 SECURITY DEFINER 함수 1개 추가
- `CallLogPopupProvider.tsx` 저장 로직 소폭 변경
- 기존 RLS 정책, 다른 화면(고객관리 리스트의 상태 드롭다운 등)은 변경 없음
