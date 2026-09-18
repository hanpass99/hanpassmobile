# 한패스 직원 권한 + 소속 구분

## 1. 새 권한: 한패스 직원

- 권한 종류에 `한패스 직원`을 추가합니다 (기존: 관리자 / 직원).
- 이 권한을 가진 사람이 로그인하면:
  - 왼쪽 메뉴에 **고객 관리** 하나만 보입니다 (대시보드·문자·텔레그램·통화내역·채널·SLA·설정 등은 숨김).
  - 고객 관리 화면에서 **개통 신청자** 탭만 보입니다. 다른 탭은 나타나지 않습니다.
  - 개통 신청자 목록은 **모든 나라 전체**를 볼 수 있고, **추가·수정·삭제까지 전체 편집**이 가능합니다.
- 주소를 직접 입력해 다른 화면으로 들어가려 해도 고객 관리로 돌려보냅니다.
- 데이터 접근 규칙(서버 측)도 같이 적용해, 개통 신청자 외 다른 고객 풀 데이터는 조회·수정되지 않게 막습니다.

## 2. 소속 선택 (한패스 / 한패스 모바일)

- 기존 "부서"(OB VN, OB BD 등)는 그대로 두고, **소속**이라는 항목을 새로 추가합니다.
- 관리자가 직원을 등록할 때 소속을 **한패스** 또는 **한패스 모바일** 중에서 선택합니다.
- 직원 관리 목록과 상세 정보에 소속이 표시되고, 관리자가 나중에 변경할 수 있습니다.
- **기존에 등록된 모든 직원은 '한패스 모바일'로 일괄 설정**합니다. 이후 새로 만드는 계정은 선택 필수.

## 3. 기술 상세

- 마이그레이션 1: `app_role` enum에 `hanpass_staff` 값 추가 (enum 추가는 별도 트랜잭션 필요하므로 단독 마이그레이션).
- 마이그레이션 2:
  - `profiles.company text not null default '한패스 모바일'` 추가 + 기존 행 백필, 허용값 검증 트리거(한패스 / 한패스 모바일).
  - `admin_set_profile_company(_user_id uuid, _company text)` security definer 함수 (관리자 전용).
  - `public.is_hanpass_staff(_user_id uuid)` security definer helper.
  - `customers` RLS: `hanpass_staff`는 `pool = 'activation_request'` 행에 한해 select/insert/update/delete 허용. 기타 테이블(콜로그·SMS·텔레그램 등)에는 권한 부여 안 함.
  - `admin_set_user_role`이 새 역할값을 허용하도록 확인/보완.
- `src/hooks/use-auth.tsx`: `isHanpassStaff` 노출 (user_roles 조회 결과에서 판정), `company` 로드.
- `src/components/AppSidebar.tsx`: `isHanpassStaff`면 고객 관리 항목만 렌더.
- `src/routes/__root.tsx`(또는 라우트 가드): `isHanpassStaff`가 `/customers` 외 경로 접근 시 `/customers?pool=activation_request`로 리다이렉트.
- `src/routes/customers.lazy.tsx`: `visiblePools`를 `isHanpassStaff ? ['activation_request'] : POOLS`로 변경 (기존 리셋 useEffect가 탭 보정 처리).
- `src/routes/settings.tsx` + `src/hooks/use-settings.ts` + `supabase/functions/admin-create-staff/index.ts`: 직원 추가 폼에 소속 Select(한패스/한패스 모바일) 추가, 목록/상세 표시, 역할 선택에 "한패스 직원" 추가.
- i18n(ko/en)에 소속·역할 라벨 추가, `bunx tsgo --noEmit` 통과 확인.
