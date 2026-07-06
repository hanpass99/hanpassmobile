
# 개통 신청자 SLA 관리 및 팀 벌금 시스템

**적용 범위**: 고객 관리 > 개통 신청자 (`pool = 'activation_request'`) 탭 전용. 기존 고객/신규 가입자에는 미적용.
**팀 단위**: 국가(country_id) 기준. 팀 = 고객의 국가(CIS, VN 등).

---

## 1. SLA 규칙

| 상태 | 기준 시간 | 일 벌금 |
|---|---|---|
| 미처리 (new) | 고객 등록 후 24h | ₩5,000 |
| 진행중 (in_progress) | 상태 변경 후 48h | ₩3,000 |
| 부재 (absent) | 상태 변경 후 48h | ₩5,000 |

- 기준 시점: `new`는 `imported_at`, 나머지는 `status_changed_at`.
- 초과 후 매일 자동 누적 (경과 일수 × 일 벌금).

## 2. DB 변경 (migration)

- `sla_config` 테이블: 상태별 SLA 시간/일 벌금 (관리자가 수정 가능하도록 확장 대비).
- `sla_fine_adjustments` 테이블: 팀별·기간별 관리자 조정 (초기화/수정/면제) 기록.
  - `country_id`, `period_start`, `period_end`, `adjustment_type` (`reset`|`override`|`waive`), `amount`, `reason`, `admin_id`, `created_at`.
- `sla_audit_log` 테이블: 모든 조정 이력.
- View `activation_request_sla_status`: 개통 신청자 중 SLA 대상 상태(new/in_progress/absent)의 현재 위반 여부 + 초과 일수 + 누적 벌금.
- RPC 함수:
  - `sla_violations_list(_country_ids uuid[], _date_from, _date_to)` — 개별 고객 위반 목록.
  - `sla_team_summary(_date_from, _date_to)` — 팀별 위반 건수 + 기간 벌금 (오늘/주/월).
  - `sla_dashboard_total()` — 현재 SLA 위반 총 건수 (대시보드 카드용).
  - `admin_sla_reset_fine`, `admin_sla_override_fine`, `admin_sla_waive_fine` (SECURITY DEFINER + has_role admin 체크, 이력 자동 기록).
- Realtime: `customers`, `sla_fine_adjustments` 테이블 publication에 추가.

## 3. 프론트엔드

**신규 라우트**: `/sla`
- 사이드바에 "SLA 관리" 메뉴 추가 (개통 신청자 접근 권한 있는 사용자에게 표시).
- 페이지 구성:
  1. 상단 요약: 오늘/이번 주/이번 달 팀별 벌금 카드
  2. 팀별 테이블: 팀 | 미처리 SLA 초과 | 진행중 초과 | 부재 초과 | 총 위반 | 오늘 벌금 | 이번주 벌금 | 이번달 벌금
  3. 위반 고객 상세 리스트 (팀 클릭 시 필터링, 고객 클릭 시 편집 다이얼로그 열림)
  4. 관리자 전용: 벌금 초기화/수정/면제 액션 다이얼로그 + 이력 표시

**대시보드 카드 추가** (`routes/index.tsx`):
- "⚠ SLA 위반" 카드 → 클릭 시 `/customers?pool=activation_request&sla=violated`로 이동.
- `customers` 페이지에 `sla` search param 추가 → SLA 위반 고객만 필터링.

**실시간**: `/sla` 페이지에서 `customers` 및 `sla_fine_adjustments` 채널 구독 → 관련 쿼리 invalidate.

**훅**: `src/hooks/use-sla.ts`
- `useSlaTeamSummary`, `useSlaViolations`, `useSlaDashboardTotal`, admin mutation 훅.

## 4. 표시 UI

- 개통 신청자 리스트에서 SLA 위반 행에 경고 배지(빨강/노랑) 표시.
- 상태 뱃지 옆 경과 시간 툴팁.

## 5. 관리자 기능

- role='admin'만 벌금 초기화/수정/면제 버튼 노출.
- 모든 조정은 `sla_audit_log`에 기록되어 `/sla` 하단 "변경 이력" 섹션에 표시.

## 기술 요약

- SQL migration으로 테이블/함수/publication 생성 후 승인.
- 이후 프론트엔드 코드(routes, hooks, sidebar, dashboard card, customers filter) 작성.
- 벌금 계산은 서버측 SQL에서 수행 (프론트 계산 없음).
