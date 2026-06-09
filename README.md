# Hanpass Mobile OB Call CRM

한패스 모바일 아웃바운드 콜 CRM 시스템. 고객 관리, 콜 라운드, 상태 변경 자동 담당자 지정, 출근 관리, 직원·국가·채널별 성과 대시보드, SMS 발송, 엑셀 업/다운로드를 제공합니다.

---

## 1. 기술 스택

| 영역 | 사용 기술 |
|---|---|
| Frontend | React 19, TypeScript, TanStack Start v1, TanStack Router (file-based), TanStack Query, Vite 7, Tailwind CSS v4, shadcn/ui, Radix UI |
| Backend (앱 내부) | TanStack Start Server Functions (`createServerFn`) — Cloudflare Workers 런타임 |
| Backend (외부 API/Webhook) | Supabase Edge Functions (Deno) |
| Database / Auth / Storage | Supabase (Postgres + RLS, Auth, Storage) |
| 배포 | Lovable (preview/production) / Cloudflare Workers (SSR) |
| 패키지 매니저 | bun (npm 호환) |

---

## 2. 실행 가이드

### 사전 요구사항
- Node.js **20+** (권장 LTS 20.x)
- bun **1.1+** (`curl -fsSL https://bun.sh/install | bash`) — 또는 npm 10+
- Supabase 프로젝트 (URL / publishable key)

### 설치
```bash
bun install        # 또는 npm install
```

### 환경변수 (`.env`)
```env
VITE_SUPABASE_URL="https://<project-ref>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon/publishable key>"
VITE_SUPABASE_PROJECT_ID="<project-ref>"

# 서버 함수(SSR)용 — 동일 값
SUPABASE_URL="https://<project-ref>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<anon/publishable key>"
SUPABASE_PROJECT_ID="<project-ref>"
```

> `VITE_*` = 브라우저 빌드타임에 주입됩니다. 시크릿이 아닌 publishable 키만 넣으세요.
> `SUPABASE_SERVICE_ROLE_KEY`, `ALIGO_*`, `LOVABLE_API_KEY` 등 비밀값은 Supabase 프로젝트의 Edge Function Secrets에만 저장합니다 (코드/`.env` 금지).

### 개발 서버
```bash
bun run dev        # http://localhost:8080
```

### 빌드 / 미리보기
```bash
bun run build         # production
bun run build:dev     # development mode 빌드
bun run preview       # 빌드 결과 미리보기
```

### 코드 품질
```bash
bun run lint
bun run format
```

### Supabase CLI (DB 마이그레이션 / 함수 배포)
```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push                                  # 마이그레이션 적용
npx supabase functions deploy <function-name>          # admin-*, send-sms 등
```

---

## 3. 디렉토리 구조

```
src/
  routes/                  TanStack file-based routes (/, /auth, /customers, /sms, /attendance, /settings, /reports, /staff-performance, /country-performance, /channel-performance)
  components/              UI 컴포넌트 (AppSidebar, PageHeader, StatCard 등) + shadcn ui
  hooks/                   use-auth, use-customers, use-dashboard, use-staff, use-sms, use-attendance, use-settings, use-call-goal, use-theme
  integrations/supabase/   client.ts(브라우저), client.server.ts(service role), auth-middleware.ts, auth-attacher.ts, types.ts (자동생성)
  lib/                     utils, date-range, labels, error-page, image-resize
  i18n/                    한/영/베트남어 등 다국어 리소스
  styles.css               Tailwind v4 + 디자인 토큰
  start.ts / router.tsx / server.ts   런타임 부트스트랩

supabase/
  migrations/              SQL 마이그레이션 (39개)
  functions/               admin-create-staff, admin-delete-staff, admin-reset-staff-password, admin-list-staff-activity, send-sms
  config.toml              Edge Function 설정
```

---

## 4. 데이터베이스 구조 (ERD 요약)

### 핵심 테이블
| 테이블 | 주요 컬럼 | 설명 |
|---|---|---|
| `profiles` | id (uuid FK auth.users), display_name, department, country_id, avatar_url, is_active, sort_order, can_access_new_signup | 직원 프로필 |
| `user_roles` | user_id, role (`admin`\|`staff`) | 권한 (별도 테이블 — 권한 상승 공격 방지) |
| `profile_countries` | user_id, country_id | 직원 ↔ 담당 국가 N:M |
| `countries` | id, code, name_ko, is_active | 국가 마스터 |
| `channels` | id, name, is_active | 유입 채널 |
| `customers` | id, name, phone, email, country_id, channel_id, pool(enum), status(enum), assigned_to, call_round, status_changed_at, status_changed_by, imported_at, activation_date, application_date, carrier_plan, requested_plan, charge_phone, memo | 고객 마스터 |
| `customer_call_rounds` | customer_id, staff_id, round, call_date | 콜 라운드 이력 (담당자×고객×일자) |
| `customer_notes` | customer_id, author_id, body | 상담 메모 |
| `call_logs` | customer_id, staff_id, call_date, is_activation | 통화 로그 |
| `sms_templates` | id, name, body, language | SMS 템플릿 |
| `sms_logs` | customer_id, staff_id, template_id, phone, body, status, provider_msg_id | SMS 발송 이력 |
| `staff_attendance` | user_id, attendance_date, status(enum: present/absent/leave 등), note, set_by | 출근 관리 |
| `targets` | user_id, year, month, activation_target | 월별 개통 목표 |

### enum 타입
- `app_role`: `admin`, `staff`
- `customer_pool`: `existing`, `new_signup`, `prepaid`, `activation_request`
- `customer_status`: `new`, `in_progress`, `activated`, `rejected`, … (마이그레이션 참조)
- `attendance_status`: `present`, `absent`, `leave`, …

### 관계 요약
```
auth.users ─1:1─ profiles ─1:N─ profile_countries ─N:1─ countries
profiles   ─1:N─ user_roles
profiles   ─1:N─ customers (assigned_to)
customers  ─N:1─ countries / channels
customers  ─1:N─ customer_call_rounds / customer_notes / call_logs / sms_logs
profiles   ─1:N─ staff_attendance / targets
```

### 권한(RLS) 핵심 규칙
- 모든 public 테이블 RLS 활성화. `has_role(uid, 'admin')` security-definer 함수로 관리자 우회.
- `customers`:
  - admin은 전체 R/W.
  - staff는 본인 담당 국가(`profile_countries`)의 고객만 조회/수정.
  - 상태 변경 시 트리거 `auto_assign_customer` 가 `assigned_to := auth.uid()` 자동 지정 + `status_changed_at`, `status_changed_by` 기록.
  - `prevent_assigned_to_escalation` 트리거로 다른 직원의 고객을 강제 탈취 금지(단, 상태 변경으로 본인 인계는 허용).
- `user_roles`는 본인 외 수정 불가. 권한 변경은 `admin_set_user_role()` 함수로만.

### 주요 DB 함수 (RPC)
- `stats_dashboard_summary(_date_from, _date_to, _year, _month, _country_id, _pool)` — 대시보드 한 번에 집계
- `stats_status_counts`, `stats_totals`, `stats_daily_calls`, `stats_country_activated`, `stats_channel_summary`, `stats_staff_ranking`, `stats_call_completed`
- `search_customers(...)` — 고객 검색/정렬/페이지네이션
- `set_staff_attendance(...)`, `stats_attendance_summary(_date)`
- `admin_set_user_role`, `admin_set_profile_active`, `admin_set_profile_country(ies)`, `admin_set_profile_sort_order(s)`, `admin_set_profile_new_signup_access`
- `has_role`, `current_user_country`, `current_user_countries`, `can_access_new_signup`
- 트리거 함수: `auto_assign_customer`, `prevent_assigned_to_escalation`, `record_call_round`, `set_channel_from_pool`, `unassign_on_new_status`, `handle_new_user`, `touch_updated_at`

전체 정의는 `supabase/migrations/*.sql` 참고.

---

## 5. API 명세

### 5.1 인증
- Supabase Auth (Email + Password). 신규 회원가입은 막혀 있고, 관리자가 `admin-create-staff` Edge Function으로 계정 생성.
- 클라이언트: `supabase.auth.signInWithPassword({ email, password })`.
- 모든 server function 호출에는 `attachSupabaseAuth` 미들웨어가 `Authorization: Bearer <access_token>` 자동 부착.

### 5.2 Server Functions (앱 내부 RPC)
TanStack Start `createServerFn` — 클라이언트에서 `useServerFn(fn)` 으로 호출. `src/lib/*.functions.ts` 와 각 `src/hooks/*.ts` 참고.

### 5.3 Supabase RPC (PostgREST)
```
POST /rest/v1/rpc/<function_name>
Headers: Authorization: Bearer <jwt>, apikey: <publishable_key>
Body:    { "_param": value, ... }
```
대표 함수: `stats_dashboard_summary`, `search_customers`, `set_staff_attendance`, `admin_set_user_role`, `customers_existing_phones`.

### 5.4 Edge Functions
URL 패턴: `https://<project-ref>.supabase.co/functions/v1/<name>`
헤더: `Authorization: Bearer <user JWT>` (관리자만 호출 가능 — 함수 내부에서 `user_roles` 확인).

| Endpoint | Method | 권한 | Body | Response |
|---|---|---|---|---|
| `/admin-create-staff` | POST | admin | `{ email, password, display_name, department?, country_ids?[], role? }` | `{ ok, user_id }` |
| `/admin-delete-staff` | POST | admin | `{ user_id }` | `{ ok }` |
| `/admin-reset-staff-password` | POST | admin | `{ user_id }` | `{ ok, temp_password }` |
| `/admin-list-staff-activity` | POST | admin | – | `{ users: [{ id, email, last_sign_in_at, created_at }] }` |
| `/send-sms` | POST | authenticated | `{ customer_ids[], template_id?, body, language? }` | `{ ok, sent, failed }` |

### 5.5 공통 에러
| HTTP | 의미 |
|---|---|
| 400 | 잘못된 입력 (필수 파라미터 누락 등) |
| 401 | 미인증 (`No authorization header`, `Invalid token`) |
| 403 | 권한 없음 (admin 전용 함수에 staff 호출 등 → `forbidden`) |
| 409 | 중복 (이메일/전화번호 unique 위반) |
| 500 | 서버 내부 오류 |

---

## 6. 권한 구조

| 역할 | 권한 |
|---|---|
| **admin** | 모든 메뉴/데이터 접근. 직원 생성·삭제·비번 재설정·국가 배정·정렬·신규가입 메뉴 접근권 부여. 모든 고객/통계 조회·수정. |
| **staff** | 본인 담당 국가(`profile_countries`) 의 고객만 조회/수정. 본인 출근 등록. 본인 SMS 발송. 대시보드는 본인 성과 기준. |

### 메뉴별 접근
| 메뉴 | admin | staff |
|---|---|---|
| 대시보드 (`/`) | ✅ | ✅ (담당 국가 한정) |
| 고객 관리 (`/customers`) | ✅ 전체 | ✅ 담당 국가 한정 |
| 한패스 신규 가입자 | ✅ | `profiles.can_access_new_signup = true` 인 staff만 |
| SMS (`/sms`) | ✅ | ✅ |
| 출근 (`/attendance`) | ✅ 전체 | ✅ 본인 |
| 보고서/성과 (`/reports`, `/staff-performance`, `/country-performance`, `/channel-performance`) | ✅ | ❌ (관리자 전용) |
| 설정 (`/settings`) | ✅ 전체 | ✅ 본인 프로필만 |

상태 변경 권한: 본인 담당 국가의 고객은 다른 직원이 처리 중이어도 상태 변경 가능 → 자동으로 본인이 담당자로 인계됩니다.

---

## 7. 주요 기능

- **로그인**: 이메일/비밀번호. 신규 가입 비활성.
- **다국어**: 한국어/영어/베트남어 (`src/i18n`). 사이드바에서 즉시 변경.
- **고객 관리**: 검색·필터(국가, 담당자, 상태, 풀, 라운드, 기간), 정렬, 페이지네이션, 인라인 상태/라운드 변경, 메모.
- **상태 변경 → 자동 담당자 지정**: 트리거가 `assigned_to = auth.uid()` + `status_changed_at/by` 갱신.
- **콜 라운드**: 라운드 수정 시 `customer_call_rounds`에 (직원×고객×일자) 단위로 적재 → 통계 기준.
- **출근 관리**: `set_staff_attendance` RPC로 본인/관리자 입력. 대시보드 직원 랭킹은 `present` 인 사람만 표시.
- **대시보드**: 상태별 카운트, 일별 통화/개통, 국가별/채널별 성과, 직원 랭킹, 월 목표 진척.
- **직원·국가·채널 성과**: 별도 페이지에서 기간 필터 + 차트.
- **엑셀 업/다운로드**: `xlsx` 라이브러리. 업로드 시 중복 전화 검증(`customers_existing_phones`).
- **실시간 동기화**: Supabase Realtime 구독으로 다른 직원의 변경 반영.
- **SMS 발송**: 알리고(Aligo) API 연동 (`send-sms` Edge Function).

---

## 8. 환경변수 전체 목록

### 클라이언트/SSR (`.env`)
| 키 | 의미 |
|---|---|
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | Supabase 프로젝트 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | anon/publishable 키 (RLS 적용) |
| `VITE_SUPABASE_PROJECT_ID` / `SUPABASE_PROJECT_ID` | 프로젝트 ref |

### Edge Function Secrets (Supabase Dashboard → Project Settings → Functions → Secrets)
| 키 | 용도 |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | admin Edge Function에서 RLS 우회 |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` | Edge Function 내부 클라이언트 |
| `ALIGO_API_KEY`, `ALIGO_USER_ID`, `ALIGO_SENDER` | SMS 발송 |
| `LOVABLE_API_KEY` | (Lovable 호스팅 사용 시) |
| `PROXY_URL`, `PROXY_SECRET` | 외부 프록시 (필요 시) |

### 환경 구분
- **개발**: 로컬 `.env` + `bun run dev`
- **스테이징/운영**: 호스팅 플랫폼(예: Cloudflare/Lovable)의 환경변수 UI에서 동일 키 등록. `.env` 파일은 절대 커밋하지 마세요.

---

## 9. 배포

### 현재 호스팅
- Lovable 플랫폼 (Cloudflare Workers SSR) + Supabase (DB/Auth/Storage/Edge Functions).
- 프리뷰: `https://id-preview--<id>.lovable.app`
- 운영: `https://hanpassmobile.lovable.app`

### Production 빌드
```bash
bun run build      # dist/ 에 SSR 번들 + 정적 자산 생성
```

### Cloudflare Workers 직접 배포 (대안)
```bash
npx wrangler deploy
```
`wrangler.jsonc` 에 `main: src/server.ts`, `nodejs_compat` 플래그 설정되어 있음.

### Supabase 배포
```bash
npx supabase db push                         # 마이그레이션
npx supabase functions deploy admin-create-staff
npx supabase functions deploy admin-delete-staff
npx supabase functions deploy admin-reset-staff-password
npx supabase functions deploy admin-list-staff-activity
npx supabase functions deploy send-sms
```

### 운영 배포 시 주의
1. **서비스롤 키 노출 금지** — Edge Function Secrets 외 어느 곳에도 두지 마세요.
2. **RLS 정책 검증** — 새 테이블 추가 시 반드시 `ENABLE ROW LEVEL SECURITY` + `GRANT` + `POLICY` 세트.
3. **마이그레이션 순서** — `supabase/migrations` 파일명 타임스탬프 순서대로 적용.
4. **Auth 이메일 템플릿** — 운영 도메인으로 SMTP 발송 설정 권장.
5. **백업** — Supabase Daily Backup 활성화 / 주기적 CSV export.
6. **SMS 비용** — Aligo 잔액 모니터링.

---

## 10. 테스트 자료

- **테스트 계정**: 최초 가입자가 자동 admin (`handle_new_user` 트리거). 이후는 admin이 `/settings` 에서 직원 생성.
- **테스트 데이터**: 고객 관리 화면의 "엑셀 업로드" 로 샘플 CSV/XLSX 업로드.
- **주요 시나리오**:
  1. admin 로그인 → 직원 생성 → 국가 배정.
  2. staff 로그인 → 엑셀 업로드 → 고객 상태 변경 → 자동 담당자 지정 확인.
  3. SMS 템플릿 생성 → 다건 발송 → `sms_logs` 확인.
  4. 출근 등록 → 대시보드 직원 랭킹에서 결근자 제외 확인.
  5. 기간 필터 변경 → 대시보드/성과 페이지 통계 일치 확인.

---

## 11. 알려진 이슈 / 향후 과제
- Supabase Auth 이메일 발송은 기본 SMTP 사용 중 → 운영 시 커스텀 SMTP/도메인 권장.
- Realtime 구독은 `customers` 테이블 전체 → 데이터 증가 시 채널/국가 필터링 최적화 검토.
- 콜 라운드는 (직원×고객×일자) unique → 같은 날 같은 고객에 라운드 여러 번 변경 시 마지막 값만 남음.
- 엑셀 업로드 대용량(>10k 행) 시 청크 처리 권장.

---

## 12. 코드 인수 체크리스트
- [ ] 본 ZIP 압축 해제 → `bun install` → `.env` 작성 → `bun run dev` 정상 기동.
- [ ] Supabase 프로젝트 신규 생성 시 `supabase/migrations/*.sql` 순서대로 적용.
- [ ] Edge Function 5종 배포 및 Secrets 등록.
- [ ] 최초 관리자 계정 가입 → admin 권한 자동 부여 확인.
- [ ] 운영 도메인 연결 및 HTTPS 인증.

문의: 본 프로젝트 인계 담당자에게 연락 바랍니다.
