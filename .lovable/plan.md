# 직원 관리 메뉴 분리

지금은 직원 목록·권한·소속이 "설정" 화면 아래쪽에 묻혀 있어 보기 불편합니다. 이를 별도의 **직원 관리** 메뉴로 빼냅니다.

## 바뀌는 점

- 왼쪽 메뉴 "시스템" 그룹에 **직원 관리** 항목 추가 (관리자에게만 표시)
- 직원 관리 화면에서 관리하는 것:
  - 직원 목록 (이름, 부서, **소속**, **권한**, 담당 국가, 전화번호, 목표, 활성/비활성)
  - 권한 변경 (관리자 / 직원 / 한패스 직원)
  - 소속 변경 (한패스 / 한패스 모바일)
  - 신규 직원 등록, 비밀번호 초기화, 직원 삭제, 순서 변경
  - 이번 달 목표 일괄 설정
- "설정" 화면에는 **내 계정**(이름·사진·비밀번호 등) 관련 항목만 남깁니다.
- 관리자가 아닌 사용자가 직원 관리 주소로 들어가면 설정 화면으로 돌려보냅니다.
- 기능과 동작은 그대로이며 위치만 옮깁니다.

## 기술 메모

- 새 라우트 `src/routes/staff.tsx` 생성: 현재 `settings.tsx`의 직원 관리 카드(256–488행), 목표 일괄 설정 카드(491–511행), 관련 다이얼로그(비밀번호 초기화/삭제/상세), `CreateStaffDialog`, 관련 핸들러(`setRole`, `setCompany`, `setActive`, `setCountries2`, `setNewSignupAccess`, `setTelegramAccess`, `moveRow`, `saveTarget`, `resetPassword`, 삭제)와 `useSettingsData` 호출을 이동.
- `settings.tsx`에는 `ProfilePhotoSection`과 내 계정 카드만 유지, 미사용 import 정리.
- `AppSidebar.tsx`: `isAdmin`일 때 `{ title: "직원 관리", url: "/staff", icon: Users2 }`를 시스템 그룹에 추가.
- i18n(`ko.ts`/`en.ts`)에 `nav.staff`, `head.staff` 라벨 추가.
- `bunx tsgo --noEmit` 통과 확인.
