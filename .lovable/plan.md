# 페이스북 신청자: 10월 데이터만 남기기

## 현재 상태 (확인한 숫자)
- 전체 1,236건 중 **신청일이 10월인 건은 3건뿐**입니다.
- 1,233건은 7~9월 신청 건입니다. 이 중 1,110건은 이미 담당자가 배정되어 상태·통화 기록이 있습니다.
- 오늘 7~8월 신청 건 6건이 새로 들어왔습니다(맨 위 KHASAN, Utkir 등). 한패스앱 신청자에서 지운 사람이 이쪽 시트에도 있어서 다시 들어온 것입니다.

## 할 일
1. 신청일이 10월 1일 이전인 페이스북 신청자 1,233명을 메모·통화 기록·통화 차수·상태 기록과 함께 삭제합니다. 전화 기록·텔레그램 상담방·문자 기록은 남기고 고객 연결만 끊습니다.
2. 두 구글 시트(구글폼 / 구글폼 인터)에서 10월 이전 건이 다시 들어오지 않도록 막습니다. 한패스앱 신청자와 같은 방식이며, 게시하지 않아도 바로 적용됩니다.
3. 1분 정도 지켜본 뒤 10월 건 3건만 남고 늘지 않는지 확인합니다.

주의: 담당자가 작업하던 1,110건의 기록도 함께 지워지며 되돌릴 수 없습니다.

## Technical
- Delete scope: customers where pool='google_form_activation' and signup_date < '2026-10-01' (child rows deleted, references nulled first).
- Extend the BEFORE INSERT trigger function skip_old_received_sheet_rows to also skip pool='google_form_activation' rows with signup_date < '2026-10-01' and notes like '구글폼%자동 등록%'.
- Add the same date guard in the google_form_activation sync paths in src/lib/google-form-sync.functions.ts.
