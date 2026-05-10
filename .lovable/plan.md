## OB 콜 시스템 추가 개선 계획

### 1. 담당자 자동 지정 (직원 포함)
- `customers` 업데이트 트리거 추가: status가 변경될 때 `assigned_to = auth.uid()` 자동 설정
- 마이그레이션으로 트리거 함수 생성

### 2. 다국어(i18n) 지원
- `react-i18next` + `i18next` 설치
- `src/i18n/` 폴더에 `ko.json`, `en.json` 리소스 작성 (사이드바, 헤더, 주요 라벨)
- AppSidebar / 주요 페이지 헤더에 `useTranslation` 적용
- 사이드바 하단 또는 헤더에 언어 토글 버튼 (localStorage 저장)

### 3. 고객 관리 — 등록일(데이터 등록일) 날짜 범위 필터
- `src/routes/customers.tsx`에 시작일/종료일 Date Picker 2개 추가
- `imported_at` 기준 필터링 (클라이언트 사이드)

### 4. 대시보드 통계 변경 (`src/routes/index.tsx`)
- "월 목표 달성률", "총 고객 수" 카드 제거
- "개통 완료율 = 개통 완료 ÷ 총 콜수 × 100" 카드 추가 (% 표시)

### 5. 관리자 고객 일괄 삭제
- 고객 테이블에 체크박스 컬럼 추가 (관리자만)
- 전체선택 헤더 체크박스
- "선택 삭제" 버튼 + AlertDialog 확인
- 선택된 id 배열로 `.delete().in('id', ids)`

### 6. 다크/라이트 테마 토글
- `src/styles.css`의 `.dark` 토큰 활용 (이미 정의되어 있다면 활용, 없으면 추가)
- `ThemeProvider` 훅 작성 → `<html>`에 `dark` 클래스 토글, localStorage 저장
- 사이드바/설정에 토글 스위치

### 7. 직원 콜 목표 알림 (50콜/일, 10콜 단위)
- `src/hooks/use-call-goal.tsx`: 직원 로그인 시 오늘 `call_logs` 카운트 구독 (realtime)
- 10/20/30/40콜 도달 시 toast 알림 ("오늘 최소 50개 이상 콜 진행해야 합니다.")
- 50콜 달성 시 알림 종료, sessionStorage로 중복 방지
- 관리자 staff-performance 페이지에 "오늘 콜수" / "목표 달성" 컬럼 추가

### 기술 노트
- 마이그레이션: `auto_assign_on_status_change` 트리거 함수 + customers BEFORE UPDATE 트리거
- realtime: `call_logs` 테이블 publication 추가
- 테마 토큰은 styles.css `:root` / `.dark` 양쪽 정의 확인 후 보강

승인 시 위 순서대로 구현합니다.