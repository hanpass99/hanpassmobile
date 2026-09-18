# 회원가입 기능 추가 (관리자 승인제)

로그인 화면에 회원가입을 추가합니다. 가입하면 즉시 사용은 안 되고, 관리자가 직원 관리에서 승인해야 접속할 수 있습니다.

## 사용자에게 보이는 변화

- 로그인 화면에 "회원가입" 링크 추가
- 가입 화면: 이름, 이메일, 비밀번호, 소속 선택(한패스 / 한패스 모바일)
- 가입 완료 시 "가입 확인 메일" 안내 → 메일 확인 후 "관리자 승인 대기 중" 안내
- 승인 전 로그인하면 "관리자 승인 대기 중입니다" 화면만 표시
- 직원 관리 화면에 "승인 대기" 표시 + 승인 버튼, 승인하면서 권한(Admin/직원/한패스 직원) 배정
- 신규 가입자에게는 권한이 자동 부여되지 않음 (관리자가 배정)

## 기술 계획

### 1. DB 마이그레이션
- `handle_new_user()` 트리거 수정:
  - `raw_user_meta_data->>'company'`를 `profiles.company`에 저장 (검증: '한패스'/'한패스 모바일'만 허용)
  - 자체 가입자는 `is_active = false`, `user_roles`에 역할 넣지 않음
  - 관리자가 만든 계정(admin-create-staff, metadata에 `created_by_admin` 표시)은 기존대로 `is_active = true` + `staff` 역할
  - 최초 사용자는 기존대로 admin 유지

### 2. 가입 화면 (`src/routes/auth.tsx`)
- `mode`에 `"signup"` 추가: 이름/이메일/비밀번호/소속 선택 폼
- `supabase.auth.signUp({ email, password, options: { data: { display_name, company }, emailRedirectTo: origin } })`
- 가입 후 "이메일 확인 후 관리자 승인을 기다려 주세요" 안내 상태 표시
- i18n 키 추가 (auth.signup*, ko/en)

### 3. 승인 대기 게이트
- `use-auth.tsx`: 프로필 조회에 `is_active` 포함, `isActive` 노출
- `__root.tsx` AuthedShell: 로그인은 됐지만 `is_active = false`이면 "승인 대기 중" 전용 화면(로그아웃 버튼 포함)만 표시 — 메뉴/데이터 접근 불가
- RLS 정책들은 역할(user_roles) 기반이라 역할이 없는 계정은 데이터가 자연스럽게 차단됨

### 4. 직원 관리 (`src/routes/staff.tsx`)
- 비활성(승인 대기) 계정을 목록 상단에 표시, "승인" 버튼 → `admin_set_profile_active(true)` + 역할 배정(`admin_set_user_role`)
- 신규 등록 시에도 기존과 동일하게 동작 (관리자 등록은 즉시 활성)

### 5. 검증
- `bunx tsgo --noEmit` 통과
- Playwright: 가입 폼 렌더링 확인, 가입→승인 대기 화면→관리자 승인→정상 접속 흐름 확인
