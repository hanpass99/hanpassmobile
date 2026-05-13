# 대용량(10k+) 최적화 + 국가 5개 추가

## 현재 상태 점검

- `customers.tsx`는 `.limit(2000)` 으로 최대 2,000건만 로드. 모든 검색/필터/정렬이 **클라이언트** 메모리에서 동작.
- 엑셀 업로드는 단일 `insert(payload)` — 10k건 시 PostgREST/Worker 타임아웃 위험. 중복 체크는 메모리 `Set` 비교라 실제 DB 전체와 비교 불가.
- 통계/대시보드 페이지들도 `select("*")` 후 클라이언트 집계.
- 국가 테이블에 이미 `IN`(인도), `PK`(파키스탄) 존재. 추가 필요: **미국(US), 가나(GH), 캐나다(CA)** 3개.

## 1단계 — DB 마이그레이션

**국가 추가**
- `countries` 에 US/GH/CA INSERT (이미 있는 IN, PK는 스킵).

**인덱스 (대용량 검색·필터·정렬 가속)**
- `customers(pool, imported_at desc)` — 탭+기본정렬
- `customers(country_id)`, `customers(assigned_to)`, `customers(status)`
- `customers(phone)` UNIQUE 부분 인덱스(중복 방지) — 기존 중복 있을 수 있어 일반 인덱스로 시작
- `customer_notes(customer_id)`, `call_logs(customer_id)`, `call_logs(staff_id, call_date)`, `sms_logs(staff_id, sent_at)`

**서버사이드 검색 RPC (`search_customers`)**
- 인자: pool, search, country_id, assigned_to(또는 'unassigned'), status, date_from/to, sort_key, sort_dir, page, page_size
- RLS 우회 없이 SECURITY INVOKER로 작성 → 기존 정책 그대로 적용
- 반환: rows + total_count

## 2단계 — `customers.tsx` 서버사이드 전환

- `.limit(2000)` 제거. 초기 로드는 RPC `search_customers` 로 **현재 탭/필터/정렬 + page=1, page_size=100** 만 가져옴.
- 필터/검색/정렬/탭/날짜 변경 시 RPC 재호출 (디바운스 300ms).
- 무한 스크롤(IntersectionObserver) 또는 "더 보기" 버튼으로 다음 페이지 append.
- 총 건수 표시(`total_count`) 추가.
- Realtime: 현재 표시 중인 행만 in-place 업데이트 유지(이미 구현됨).
- 일괄 삭제: 이미 chunk 처리됨(100건). 유지.

## 3단계 — 엑셀 대량 업로드 개선

- 파싱 후 **500건 단위 chunk** 로 `insert` (10k → 20회).
- 진행률 토스트("업로드 중 X/N").
- 중복 체크를 **DB 측에서**: 한 번에 phone 목록 RPC `existing_phones(pool, phones[])` 호출(또는 chunk 단위 `select phone in (...)`)로 정확한 중복 제거.
- 실패한 chunk는 재시도 안내 + 부분 성공 통계.

## 4단계 — 통계 페이지 서버 집계

`country-performance.tsx`, `channel-performance.tsx`, `staff-performance.tsx`, `index.tsx` (대시보드):

- 클라 `select("*")` → DB 집계 RPC 로 변경:
  - `stats_by_country(date_from, date_to)` → 국가별 신규/개통/콜수
  - `stats_by_channel(date_from, date_to)`
  - `stats_by_staff(date_from, date_to)`
  - `stats_dashboard(date_from, date_to)` — 카드용 합계
- 각 RPC는 SQL 단일 쿼리(`group by`)로 처리. RLS 정책 통과 데이터만 집계.

## 5단계 — UI 반영 (국가 5개 자동 노출 + 검증)

- `countries` 테이블 기반 컴포넌트들은 자동 반영됨 (settings 다중 국가 선택, customers 필터/등록, MultiCountrySelect 등).
- 엑셀 업로드 매핑(`countryByCode`)도 새 코드 자동 인식.
- 국가별 성과 페이지에서 새 국가 표시 확인.

## 기술 노트

- RPC는 모두 `SECURITY INVOKER` + `set search_path = public` — 기존 RLS 그대로 적용.
- 페이지 사이즈 100, 최대 무한 스크롤 누적 시에도 React가 가상화 없이 5,000행은 무리. 일정 누적 후 "필터를 좁혀주세요" 안내(또는 추후 react-virtual 도입 — 본 단계에서는 미포함).
- `staff` / `countries` / `channels` 룩업은 여전히 일괄 로드(작은 테이블).
- 마이그레이션은 1단계만 본 작업 범위. 2~5단계 코드 변경은 마이그레이션 승인 후 동일 메시지에서 이어서 진행.

## 비포함 (별도 요청 시)

- React Virtualization (행 가상화)
- 엑셀 업로드 백그라운드 작업 큐
- 국가별 권한 분리 RPC 캐싱
