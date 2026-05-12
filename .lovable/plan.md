# 추가 기능 개선 계획

요청량이 많아 작업을 단계별로 나누어 진행합니다. 각 단계는 독립적으로 검증 가능합니다.

## 1단계: 데이터베이스 스키마 변경

**직원 다중 담당 국가**
- `profiles.country_id` (단일) → 별도 `profile_countries` 테이블 (user_id, country_id) 다대다 관계
- 기존 `current_user_country()` 함수 → `current_user_countries()` 배열 반환으로 변경
- RLS 정책 (customers, customer_notes, call_logs) → `country_id = ANY(current_user_countries())` 로 수정
- 기존 데이터 마이그레이션: `profiles.country_id` 값을 새 테이블로 복사 (컬럼은 호환성 위해 일단 유지)

**국가 추가**
- EG (이집트), JO (요르단) `countries` 테이블에 INSERT

**프로필 사진 저장**
- Storage 버킷 `avatars` 생성 (public)
- `profiles.avatar_url` 컬럼 추가
- RLS: 본인만 자기 폴더에 업로드/수정, 누구나 조회

**미처리 상태 시 담당자 초기화 트리거**
- `customers` BEFORE UPDATE 트리거: `NEW.status = 'new'` 이면 `NEW.assigned_to = NULL`
- 기존 `auto_assign_on_status_change` 트리거 수정 (new로 바뀔 땐 할당 안 함)

**Realtime 활성화**
- `ALTER PUBLICATION supabase_realtime ADD TABLE customers, customer_notes, call_logs`
- `REPLICA IDENTITY FULL` 설정

## 2단계: 직원 설정 UI (settings.tsx)

- 단일 국가 Select → 다중 선택 (체크박스 리스트 또는 multi-select Popover)
- 저장 시 `profile_countries` 테이블 갱신 (전체 삭제 후 재삽입)
- 직원 목록에서 담당 국가들 뱃지로 표시

## 3단계: 고객 관리 (customers.tsx)

**자동 정렬 제거 + 위치 유지**
- 상태 변경 시 로컬 state만 업데이트, 재정렬 안 함
- 서버 응답 후에도 기존 정렬 순서 유지 (id 기준 stable order)

**Realtime 구독**
- `supabase.channel('customers').on('postgres_changes', ...)` 로 변경 자동 반영
- 다른 사용자가 수정 시 해당 행만 업데이트, 스크롤/포커스 위치 유지

**미처리 변경 시 담당자 미배정 표시**
- DB 트리거가 처리, UI는 응답 그대로 반영

**국가 필터에 EG, JO 자동 노출** (countries 테이블에서 동적으로 가져오므로 자동)

## 4단계: 성과 페이지 Realtime + 날짜 필터

- `country-performance.tsx`, `channel-performance.tsx` 에 시작일/종료일 DateRangePicker 추가
- 필터 변경 시 쿼리 재실행
- Realtime 구독으로 customers/call_logs 변경 시 통계 자동 갱신
- `staff-performance.tsx`, `index.tsx` (대시보드) 에도 Realtime 구독 추가

## 5단계: 프로필 사진 업로드

- settings.tsx 본인 프로필 섹션에 사진 업로드 (input file, accept image/*)
- 클라이언트에서 canvas 리사이즈 (최대 512x512, JPEG quality 0.85)
- Storage 업로드 → public URL을 `profiles.avatar_url` 에 저장
- 기존 `Avatar` 컴포넌트 활용 (`AvatarImage src={avatar_url}` + `AvatarFallback` 이름 이니셜)
- 표시 위치: 사이드바, 직원 목록, 직원별 성과, 고객 담당자 표시 영역

## 기술 노트

- Realtime: postgres_changes 이벤트 핸들러 내에서 setState 시 기존 배열 순서 보존
- 다중 국가 RLS: `country_id IN (SELECT country_id FROM profile_countries WHERE user_id = auth.uid())` 형태의 SECURITY DEFINER 함수 사용
- 트리거 순서: `auto_assign_on_status_change` 가 먼저, 그 다음 미처리 초기화 로직 (또는 한 트리거에 통합)

## 진행 방식

승인 후 1단계(DB 마이그레이션)부터 순서대로 진행합니다. 각 단계 완료 후 다음 단계로 이어갑니다.