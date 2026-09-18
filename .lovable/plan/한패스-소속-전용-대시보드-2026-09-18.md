# 한패스 소속 전용 대시보드

한패스 소속 직원들의 업무 현황을 나라(팀)·직원·상태·날짜별로 한눈에 보는 전용 화면을 추가합니다.

## 1. 접근 권한

- 새 메뉴 **한패스 현황** (`/hanpass-dashboard`) 추가.
- 한패스 소속 직원 전원 + 관리자에게 보입니다. 한패스 직원 사이드바에는 "고객 관리" 위에 이 메뉴가 함께 표시됩니다.
- 한패스 모바일 소속 일반 직원에게는 보이지 않습니다.
- 표시되는 직원은 **한패스 소속 직원만** (한패스 모바일 직원 실적은 섞이지 않음).

## 2. 집계 기준

- **처리 건수(콜 수)** = 직원이 고객 상태를 변경한 기록 기준.
  - 같은 고객을 하루에 여러 번 바꿔도 **그 날 1건**으로 계산 (직원 + 고객 + 날짜 단위 중복 제거).
- **대상 고객**: 개통 신청자, QR 개통 신청, 친구 추천, 선불폰 충전자 4개 그룹.
- **팀** = 담당 나라 (예: PK 팀 = 파키스탄 담당 직원 전원). 담당 나라가 여러 개면 각 팀에 모두 포함됩니다.

## 3. 화면 구성

**상단 필터** — 기간(시작·종료일, 오늘/이번주/이번달 빠른 선택), 나라(팀), 직원, 상태, 고객 그룹. 필터는 주소에 저장되어 새로고침·공유해도 유지됩니다.

**핵심 지표 카드 4개** — 기간 내 총 처리 건수, 처리한 고객 수, 개통 완료, 개통 성공률. 전기 대비 증감(%)도 함께 표시.

**팀(나라)별 현황 표** — 나라별로 인원 수, 처리 건수, 개통 완료, 성공률, 상태별 분포 막대. 행을 펼치면 그 팀 소속 직원별 실적이 나옵니다.

**직원별 상세 표** — 직원 / 팀(나라) / 처리 건수 / 개통 / 성공률 / 마지막 활동 시각 / 상태별 건수. 열 머리글로 정렬, 이름 검색 가능.

**날짜별 추이 차트** — 일자별 처리 건수와 개통 건수 라인 차트. 필터(팀·직원)에 따라 같이 바뀝니다.

**상태 분포** — 상태별 건수 카드 그리드. 클릭하면 같은 조건으로 고객 관리 목록이 열립니다.

**일자 × 직원 히트맵 표** — 가로 날짜, 세로 직원, 칸에 그날 처리 건수. 누가 어느 날 얼마나 일했는지 한눈에 확인.

**최근 활동 타임라인** — 최근 변경 내역(시각, 직원, 고객명, 나라, 변경된 상태)을 최신순으로. "더 보기"로 추가 로드.

모바일에서는 표가 카드 형태로 바뀌고 히트맵은 가로 스크롤됩니다.

## 4. 기술 상세

- 마이그레이션: `stats_hanpass_dashboard(_date_from, _date_to, _country_ids uuid[], _staff_ids uuid[], _pools text[])` SECURITY DEFINER RPC 하나로 전체 섹션 데이터를 jsonb로 반환.
  - 기반 CTE: `customer_status_history h` join `customers c` (pool in 4개) join `profiles p` (`company = '한패스'`), `select distinct h.changed_by, h.customer_id, (h.started_at at time zone 'Asia/Seoul')::date d, h.status` 으로 일자별 중복 제거 후 집계.
  - 반환 키: `totals`, `prev_totals`, `by_team`, `by_staff`, `daily`, `status_counts`, `heatmap`, `recent`(최근 50건).
  - 권한 가드: 호출자가 `has_role(auth.uid(),'admin')` 또는 `is_hanpass_company(auth.uid())` 아니면 예외.
  - 인덱스 추가: `customer_status_history (changed_by, started_at desc)`, `(customer_id, started_at desc)`.
- `src/routes/hanpass-dashboard.tsx` (lazy 분리) — TanStack Router `validateSearch` + `zodValidator` 로 필터를 URL 검색 파라미터에 보관, `useQuery` + `staleTime 5분`으로 RPC 호출. 로딩은 Skeleton, 실패 시 재시도 카드.
- `src/hooks/use-hanpass-dashboard.ts` — RPC 래퍼, `src/types/rpc.ts` 에 반환 타입 추가.
- `src/components/AppSidebar.tsx` — `isHanpass || isAdmin` 조건으로 메뉴 항목 추가 (한패스 분기 사이드바에도 포함).
- 차트는 기존 recharts, 표/카드는 기존 shadcn 컴포넌트와 디자인 토큰 재사용 (하드코딩 색상 없음).
- i18n `ko`/`en` 에 `hanpassDash.*` 라벨 추가, 라우트 `head()` 에 제목·설명 지정.
- 마무리로 `bunx tsgo --noEmit` 통과 확인.
