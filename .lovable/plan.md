# 전체 이중언어(ko/en) 전환 계획

현재 앱은 i18n 스캐폴딩(`react-i18next` + `ko.ts`/`en.ts`)이 있지만, UI의 상당 부분이 파일 내에 한국어 문자열로 하드코딩되어 있어 언어를 바꿔도 그대로 한국어로 남습니다. 이번 작업으로 모든 사용자 노출 문자열을 번역 키로 옮깁니다.

## 대상 범위

**공용 (전 페이지에 영향)**
- `src/lib/labels.ts` — 상태/풀/출근 라벨 (지금은 한국어 상수). `t()`를 쓸 수 있는 함수 형태로 리팩터.
- `src/components/AppSidebar.tsx` — `"문자 발송"`, `"SLA 관리"` 하드코딩 제거.
- `src/components/ErrorBoundary.tsx` — 오류 화면 문구.
- 각 라우트의 `head()` meta title (탭/공유 제목).

**페이지 (거의 전체 하드코딩)**
- `routes/sla.tsx` — SLA 관리 (탭·컬럼·다이얼로그·토스트 100%)
- `routes/settings.tsx` — 설정
- `routes/attendance.tsx` — 출근 관리
- `routes/channel-performance.tsx` — 채널 성과
- `routes/index.tsx` — 대시보드 잔여
- `routes/customers.tsx` + `routes/customers.lazy.tsx` — 고객 관리 (가장 큼, 2400줄)
- `routes/sms.tsx` + `routes/sms.lazy.tsx` — 문자 발송
- `routes/auth.tsx`, `routes/reset-password.tsx` — 인증 잔여

**메시지**
- 모든 `toast.success/error("...")` 문자열
- confirm/alert 다이얼로그 문구

## 진행 순서

크기 때문에 이 대화에서 **여러 턴**에 나눠 커밋하겠습니다. 순서:

1. **1턴 (기반):** `ko.ts`/`en.ts`에 새 네임스페이스(`sla`, `errors`, `head`, `labels`, 페이지별 확장) 대량 추가. `labels.ts`를 `t()` 기반 함수로 전환. `AppSidebar`, `ErrorBoundary`, 각 라우트 `head()` 수정.
2. **2턴:** `sla.tsx` 전체 번역.
3. **3턴:** `settings.tsx` 전체 번역.
4. **4턴:** `attendance.tsx` + `channel-performance.tsx` + `index.tsx` 잔여.
5. **5턴:** `customers.tsx` + `customers.lazy.tsx` 전체 번역 (가장 큼).
6. **6턴:** `sms.tsx` + `sms.lazy.tsx` + `auth.tsx` + `reset-password.tsx` 잔여.
7. **7턴 (검증):** `rg '[가-힣]'`로 UI 코드에서 한국어 잔여 없는지 확인 + 프리뷰에서 언어 스위치 스모크 테스트.

## 기술 세부사항

- `labels.ts`는 지금 `STATUS_LABELS: Record<Status, string>` 형태의 정적 맵인데, i18n 키를 반환하는 함수(`statusLabel(status, t)`) 또는 컴포넌트에서 `t('status.'+key)`를 직접 부르는 방식으로 바꿉니다. 후자가 렌더러가 언어 변경 시 자동 재렌더링되어 더 안전.
- `head()` meta 값은 라우트 로드 시점에 계산되어 언어 변경에 반응하지 않습니다. 이건 정상 한계이며, 초기 로드 시의 언어(`localStorage.lang`)를 기준으로 결정되도록 `i18n.t()`를 사용합니다.
- 토스트 문자열의 동적 값(`${msg}`)은 `t('key', { msg })` 보간으로 옮깁니다.
- 새 키는 페이지별 네임스페이스(`sla.*`, `settings.*` 확장 등)로 정리해 유지보수하기 쉽게 합니다.

## 검증

- 각 턴 종료 시 빌드 통과 확인.
- 마지막에 `rg -n '[가-힣]' src/ -g '!i18n/**' -g '!integrations/**' -g '!*.gen.ts' -g '!lib/google-form-sync*'` 결과가 주석/개발자 로그만 남는지 확인.
- 프리뷰에서 언어 토글 시 사이드바·SLA·설정·고객 페이지가 즉시 영어로 바뀌는지 시각 확인.

## 안 하는 것

- 서버(supabase functions, migrations) 내 한국어 로그/주석은 UI에 노출되지 않으므로 건드리지 않음.
- 소스코드 주석의 한국어는 그대로 둠.
- `google-form-sync.functions.ts`의 서버 로그 문자열은 건드리지 않음.
- 이메일 템플릿·PDF 등 별도 채널은 이번 범위 밖.

이 계획으로 진행할까요? 승인해주시면 1턴부터 커밋합니다.
