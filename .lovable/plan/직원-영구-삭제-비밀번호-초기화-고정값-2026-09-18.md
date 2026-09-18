# 직원 영구 삭제 + 비밀번호 초기화 고정값

## 1. 영구 삭제

지금은 "삭제"를 눌러도 계정만 막히고 직원 목록에는 비활성 상태로 계속 남습니다.
앞으로는 두 가지를 구분합니다.

- **비활성화(퇴사 처리)**: 지금처럼 목록에 흐리게 남고 기록도 유지 — 기존 그대로.
- **영구 삭제**: 직원 목록에서 완전히 사라집니다. 로그인 계정, 권한, 담당 국가, 목표 값이 지워집니다.
  - 과거 통화 내역·상담 메모·문자 발송 기록은 그대로 남습니다(이름 대신 "삭제된 직원"으로 표시).
  - 담당하던 고객은 담당자 없음 상태가 되어 다시 배정할 수 있습니다.
  - 되돌릴 수 없으므로, 삭제 창에서 직원 이름을 정확히 입력해야 실행됩니다.

## 2. 비밀번호 초기화

- 초기화 버튼을 누르면 임의 문자열 대신 항상 **hanpass12\*** 로 바뀝니다.
- 초기화 완료 창에 해당 비밀번호가 표시되어 직원에게 그대로 안내할 수 있습니다.

## 기술 상세

1. 마이그레이션
   - `phone_call_logs.staff_id → profiles.id` 외래키를 `ON DELETE SET NULL`로 재생성(기록 행 보존).
   - `call_logs.staff_id`, `customer_notes.author_id`, `sms_logs.staff_id`, `customer_status_history.changed_by`, `pending_calls.requested_by` 등 `auth.users` 참조 제약을 점검해 삭제 시 행이 사라지지 않도록 `SET NULL`(또는 제약 제거)로 조정. 필요한 컬럼은 nullable 로 변경.
   - `customers.assigned_to`는 삭제 대상 id를 `NULL`로 업데이트.
2. `supabase/functions/admin-delete-staff/index.ts`
   - body 에 `hard?: boolean` 추가. 기본(false)은 기존 소프트 삭제 유지.
   - `hard=true`: 관리자 검증 → `user_roles`/`profile_countries`/`targets` 삭제 → `customers.assigned_to` NULL 처리 → `profiles` 행 DELETE → `auth.admin.deleteUser`. 자기 자신 삭제 차단 유지.
3. `supabase/functions/admin-reset-staff-password/index.ts`
   - `genTempPassword()` 제거, 고정 상수 `const TEMP_PASSWORD = "hanpass12*"` 사용 후 동일 응답 형태(`temp_password`) 반환.
4. `src/routes/staff.tsx`
   - 삭제 다이얼로그에 "영구 삭제" 체크(또는 별도 버튼) 추가 → `hard: true` 전달, 경고 문구 표시.
   - 삭제 성공 시 행을 목록에서 즉시 제거 후 `load()`.
5. i18n(`ko.ts`/`en.ts`)에 영구 삭제 라벨/경고 문구 추가, `bunx tsgo --noEmit` 통과 확인.
