# 소속(한패스 / 한패스 모바일) 기반 권한 정리

## 1. 권한 기준 통일

- 앞으로는 **소속 + 역할** 두 가지로만 구분합니다. 기존 '한패스 직원' 권한은 없애고, 해당 계정들은 소속 '한패스' + 역할 '직원'으로 옮깁니다.
- **한패스 모바일** 소속: 지금까지와 완전히 동일 (모든 메뉴, 모든 탭).
- **한패스** 소속:
  - 왼쪽 메뉴는 **고객 관리** 하나만 보입니다.
  - 고객 관리 안에서는 **개통 신청자 / QR 개통 신청 / 친구 추천 / 선불폰 충전자** 탭만 보입니다.
  - 역할이 **직원**이면 자기 담당 나라 데이터만, **관리자**면 모든 나라 데이터를 봅니다.
  - 다른 주소로 직접 들어가도 고객 관리로 돌려보냅니다.

## 2. 담당 나라 선택 필수

- 회원가입 화면에 **담당 나라 선택(한 개)** 을 추가하고, 고르지 않으면 가입이 진행되지 않습니다.
- 아직 나라가 없는 기존 사용자는 로그인 후 **"담당 나라를 선택해 주세요"** 안내 화면이 뜨고, 본인이 직접 한 개를 고르면 바로 사용할 수 있습니다. (한 번 정한 뒤 변경은 관리자만 가능)
- 관리자는 예전처럼 직원 관리 화면에서 언제든 바꿀 수 있습니다.

## 3. 속도

사용자가 많아져도 느려지지 않도록 아래를 함께 정리합니다.

- 목록 조회에 자주 쓰는 조건(접수 구분·나라·담당자·등록일)에 색인을 추가합니다.
- 왼쪽 메뉴의 텔레그램 안읽음 숫자를 전체 행 조회 대신 합계만 가져오도록 바꿉니다.
- 로그인 직후 반복 조회되는 내 계정/권한 정보를 캐시해 화면 전환 시 재조회를 줄입니다.

## 기술 상세

**마이그레이션**
- `public.user_company(_uid uuid)`, `public.is_hanpass_company(_uid uuid)` security definer 헬퍼.
- 기존 `hanpass_staff` 역할 보유자 → `profiles.company='한패스'` + `user_roles.role='staff'` 로 데이터 이전. `app_role` enum 값은 남겨두되 앱에서 미사용 (enum 값 삭제 불가).
- `customers` / `customer_notes` 의 `*_hanpass_*` 정책 4종 교체:
  `is_hanpass_company(auth.uid())` AND `pool IN ('activation_request','qr_activation','friend_referral','prepaid_charge')`
  AND (`has_role(admin)` OR `country_id = ANY(current_user_countries())` OR `assigned_to = auth.uid()`).
  한패스 소속 관리자에게 전체 나라를 허용하되, 다른 pool 접근은 계속 차단.
- `handle_new_user()`: `raw_user_meta_data->>'country_id'` 가 있으면 `profile_countries` 와 `profiles.country_id` 에 기록.
- `set_own_country(_country_id uuid)` security definer: 호출자가 담당 나라가 하나도 없을 때만 1건 등록 (그 외에는 예외).
- 색인: `customers(pool, imported_at desc)`, `customers(country_id)`, `customers(assigned_to)`, `customers(pool, country_id)` 부분/복합 색인 점검 후 누락분 추가.

**프론트엔드**
- `use-auth.tsx`: `isHanpassStaff` → `isHanpass`(company 기준)로 대체, `countryIds` 노출, 프로필 조회 결과 react-query 캐시화.
- `AppSidebar.tsx`: 축소 메뉴 조건을 `isHanpass && !isAdmin` → `isHanpass`(관리자 포함, 단 한패스 소속 관리자도 고객 관리만)로 정리. 텔레그램 안읽음은 `select("unread_count", { head:false })` 합계 RPC로 교체.
- `customers.lazy.tsx`: `visiblePools` = 한패스 소속이면 `['activation_request','qr_activation','friend_referral','prepaid_charge']`.
- `__root.tsx`: 한패스 소속 리다이렉트 조건을 company 기준으로 변경, 담당 나라 미지정 시 `CountrySetupGate` 표시.
- 신규 `CountrySetupGate` 컴포넌트: 나라 Select + 저장(`set_own_country` RPC) 후 `refresh()`.
- `auth.tsx`: 회원가입 폼에 나라 Select(필수) 추가, `signUp` metadata 에 `country_id` 포함.
- `staff.tsx` / `use-settings.ts`: 역할 목록에서 '한패스 직원' 제거, 소속 Select 유지.
- i18n(ko/en) 문구 추가, `bunx tsgo --noEmit` 통과 확인.
