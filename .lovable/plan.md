# 작업 계획

## 1. 대시보드 통계 정합성 검수 및 수정

**문제 진단:**
- 고객 관리: "개통 완료" 3건 / 대시보드: 4건 (불일치)
- "오신청" 상태도 동일 문제 추정

**원인 분석 (DB 함수 검토 결과):**
- `stats_status_counts(_country_id)`: 국가 필터만 적용, 날짜 필터 없음 → 대시보드 상단 카운트
- `customers` 페이지: `assigned_to` / `country_id` 기반 RLS + 필터 적용
- 대시보드는 SECURITY DEFINER가 아닌 STABLE 함수라 RLS는 적용되지만, 권한이 다르면 결과 차이가 발생할 수 있음
- 또한 풀(pool) 분리(`existing` vs `activation_request`)를 대시보드는 합산하지만 고객 관리는 탭별로 표시 → 사용자 인식 차이 가능

**수정:**
- `stats_status_counts`에 날짜 필터(`_date_from`, `_date_to`) 및 풀(`_pool`) 인자 추가
- `stats_dashboard_summary`에 동일 인자 전달, 대시보드의 날짜/풀 선택을 정확히 반영
- 고객 관리의 `search_customers` 결과 카운트와 동일한 기준(imported_at 범위, country_id, pool)으로 통계 산출
- 대시보드 클릭 시 이동되는 customers URL의 필터(상태/국가/날짜)와 통계 쿼리 인자가 1:1 일치하도록 정렬

## 2. 상태 색상 파스텔 톤 개선

`src/lib/labels.ts`의 `STATUS_CLASS` 12종 모두 파스텔 + 충분한 텍스트 대비로 재구성:
- 라이트: `bg-{color}-100 text-{color}-800`
- 다크: `dark:bg-{color}-900/40 dark:text-{color}-200`
- 12색 유지: slate, sky, amber, orange, blue, emerald, pink, red, violet, indigo, stone, teal

## 3. 콜 라운드 (Call Round) 기능

**스키마 변경:**
- `customers` 테이블에 `call_round` (smallint, nullable, 1~3) 추가
- 신규 테이블 `customer_call_rounds` 생성
  - id, customer_id, staff_id, round (smallint), call_date (date), created_at
  - UNIQUE (customer_id, call_date) → "같은 날 여러 번 변경해도 1건"
- 인덱스: (staff_id, call_date), (customer_id, call_date)

**트리거:**
- `customers.call_round` UPDATE 시:
  - 변경된 경우만 작동
  - `INSERT INTO customer_call_rounds (customer_id, staff_id, call_date, round) VALUES (..., auth.uid(), CURRENT_DATE, NEW.call_round) ON CONFLICT (customer_id, call_date) DO UPDATE SET round = EXCLUDED.round, staff_id = EXCLUDED.staff_id`
  - 결과: 같은 날 = 1건, 다른 날 = 새 건

**통계 통합:**
- "콜 완료" = `customer_call_rounds`의 distinct (customer_id, call_date) 수 (날짜 범위 내)
- 직원별 콜 실적 = `customer_call_rounds` group by staff_id
- 기존 status='new' 제외 방식의 "콜 완료"는 보조 지표로 유지하거나 새 로직으로 교체
- `stats_dashboard_summary`에 `call_completed` 필드 추가
- `stats_staff_ranking`에서 `total_calls`를 `customer_call_rounds` 기반으로 재계산

**UI:**
- `customers.tsx` 테이블에 "콜 라운드" 컬럼 추가 (Select: 1차/2차/3차/없음)
- 필터 영역에 콜 라운드 셀렉트 필터 추가
- `search_customers` RPC에 `_call_round` 파라미터 추가
- `index.tsx` 대시보드 "콜 완료" 카드를 새 RPC 값으로 교체
- `staff-performance.tsx`에서 콜 실적을 새 기준으로 표시

## 기술적 세부사항

**마이그레이션 1**: `customers.call_round` 컬럼 + `customer_call_rounds` 테이블 + RLS + 트리거
**마이그레이션 2**: `stats_status_counts`/`stats_dashboard_summary`/`stats_staff_ranking`/`search_customers` RPC 갱신, 신규 RPC `stats_call_completed`

**파일 수정:**
- `src/lib/labels.ts` — 파스텔 색상
- `src/routes/customers.tsx` — 콜 라운드 컬럼/필터/업데이트
- `src/routes/index.tsx` — 대시보드 콜 완료 카드 + 정합성
- `src/routes/staff-performance.tsx` — 콜 실적 기준 변경
- `src/i18n/index.ts` — "콜 라운드", "1차/2차/3차" 라벨

## 검증
- 마이그레이션 후 SELECT로 customers vs stats 카운트 비교
- 콜 라운드 변경 후 customer_call_rounds 1건 생성 확인
- 같은 날 재변경 시 UPSERT 동작 확인
