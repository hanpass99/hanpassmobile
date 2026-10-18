# 한패스앱 신청자: 9월 이전 데이터가 다시 들어오는 문제 해결

## 원인
- 이 탭은 "접수완료" 구글 시트를 10초마다 자동으로 가져옵니다.
- 시트에는 6~9월 신청 건이 아직 남아 있어, 지운 고객을 "새 고객"으로 다시 등록하고 있습니다.
- 지금 상태: 전체 1,818건 = 10월 413건 + 다시 들어온 9월 이전 1,405건.
- 미리보기에는 "10월 1일 이전 건은 가져오지 않기" 수정을 이미 넣었습니다. 운영 사이트는 아직 예전 버전이라 계속 다시 들어옵니다.

## 해결 순서
1. **게시(Publish)** — 사용자님이 직접 눌러 주세요. 그래야 운영 사이트에도 수정이 적용됩니다.
2. 게시 후 9월 이전 건(신청일 기준 10월 1일 이전)을 메모·통화 기록·상태 기록과 함께 다시 삭제합니다. 전화 기록·텔레그램 상담방·구글폼 접수 기록은 연결만 끊습니다.
3. 1~2분 기다린 뒤 다시 세어 보고, 10월 건만 남아 더 이상 늘지 않는지 확인합니다.

## Technical
- Fix already in src/lib/google-form-sync.functions.ts: RECEIVED_MIN_DATE='2026-10-01', rows with signup_date earlier are skipped in syncGoogleFormReceived.
- Cleanup scope: customers where pool='activation_request' and signup_date < '2026-10-01' (child rows deleted, references nulled first).
