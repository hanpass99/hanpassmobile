### 기술 세부사항
- Slack 커넥터(bot)로 연결, `users.lookupByEmail` → `conversations.open` → `chat.postMessage` (게이트웨이 경유).
- 집계 로직은 순수 모듈로 분리 + 테스트 (KST 기준 전날 범위, 월누적 1일부터).
- 서버 라우트 `/api/public/hooks/daily-slack-report`: 서버 전용 시크릿 토큰으로 호출 검증 후 발송.
- 수신자 목록은 설정값(초기: asirojididin123@hanpass.com)으로 관리.
- pg_cron `0 23 * * *` (UTC = 서울 08:00), 하루 1회.
- 관리자 화면: 미리보기 + 시험 발송(승인된 관리자만).
