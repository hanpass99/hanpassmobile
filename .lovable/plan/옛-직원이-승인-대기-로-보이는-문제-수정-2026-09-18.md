# 옛 직원이 "승인 대기"로 보이는 문제 수정

## 확인된 원인

직원 관리 화면은 지금 **"권한이 없으면 승인 대기"** 로 판단합니다.
그런데 예전에 퇴사·비활성 처리한 계정들도 권한이 비어 있는 상태라서,
신규 가입자와 똑같이 "승인 대기"로 표시되고 있습니다.

권한이 비어 있는 계정 19건 중 실제 신규 가입 대기자는 9월 18일에 가입한 분들이고,
나머지(플라시오 제네시스, 허비또, 벨라, 카몰라, 퇴사자 2건, Catherine)는
예전에 퇴사/비활성 처리된 계정입니다.

## 수정 방향

계정 상태를 "권한 유무"로 추측하지 않고, **상태 값을 따로 저장**합니다.

- 계정 상태: 승인됨 / 승인 대기 / 비활성(퇴사)
- 기존 계정은 모두 **승인됨 또는 비활성**으로 정리 — 승인 대기로 뜨지 않습니다.
- 앞으로 직접 회원가입한 사람만 **승인 대기**로 표시됩니다.
- 직원 관리 화면에서 승인 대기 계정만 상단에 모이고, 퇴사·비활성 계정은 기존처럼 흐리게 표시됩니다.

## 기술 상세

1. 마이그레이션
   - `profiles.approval_status text not null default 'approved'` 추가 (허용값: `approved` / `pending` / `disabled`, 검증 트리거).
   - 백필: 권한이 있는 행 → `approved`, 권한 없고 `is_active=false`인 기존 행 → `disabled`.
   - `handle_new_user()`: 관리자 생성 계정은 `approved`, 자체 가입은 `pending`.
   - `admin_set_profile_active(_user_id, _active)`가 상태도 함께 갱신(활성화 시 `approved`, 비활성화 시 `disabled`).
2. `src/hooks/use-settings.ts`: `approval_status` 조회 후 `SettingsRow`에 추가, 정렬 기준을 `role === null` 대신 `approval_status === 'pending'` 으로 변경.
3. `src/routes/staff.tsx`: 승인 대기 배지/승인 버튼/행 강조 조건을 `approval_status === 'pending'` 으로 교체. 승인 시 권한 배정 + `approval_status = 'approved'`.
4. `src/hooks/use-auth.tsx` · `src/routes/__root.tsx`: 로그인 게이트를 `approval_status === 'pending'` 기준으로 변경(퇴사 계정은 기존 비활성 처리 유지).
5. `bunx tsgo --noEmit` 통과 확인.
