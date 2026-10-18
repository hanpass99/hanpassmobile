# 한패스앱 신청자: 10월 데이터만 남기고 삭제

## 현재 상태 (조회 결과, 등록일 기준·한국시간)
- 6월 897건, 7월 781건, 8월 592건, 9월 645건 → **삭제 대상 2,915건**
- 10월 415건 → **유지**

## 삭제 방식 (이전 삭제 작업과 동일)
- 한패스앱 신청자 탭 중 등록일이 2026년 10월 1일(한국시간) 이전인 고객 2,915명 삭제
- 함께 삭제: 메모, 통화 차수, 통화 결과, 상태 변경 기록, 대기 중이던 전화
- 기록은 남기고 연결만 끊기: 전화 기록, 텔레그램 상담방, 구글폼 접수 기록
- 다른 탭과 10월 신청 건은 건드리지 않음

## 주의
- 삭제는 되돌릴 수 없습니다(하루 1회 자동 백업으로만 복원 가능).
- 이미 삭제된 신청 건을 한패스 앱이 다시 보내면 새로 등록될 수 있습니다.

## Technical
- Scope: customers where pool='activation_request' and imported_at < '2026-09-30T15:00:00Z'.
- Delete child rows (customer_notes, customer_call_rounds, call_logs, customer_status_history, pending_calls), null out customer_id in phone_call_logs, telegram_chats, google_form_submissions, then delete customers. Verify remaining count = 415.
