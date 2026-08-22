# 텔레그램 상담 – 1분 답장 잠금 (간단 방식)

한 직원이 먼저 답장을 보내면 그 대화는 1분 동안 그 직원만 답장할 수 있게 잠깁니다. 1분이 지나면 누구나 다시 답장할 수 있습니다.

## 동작 방식

1. 직원 A가 답장(텍스트 또는 파일)을 보내면 그 대화가 1분간 A에게 잠깁니다.
2. 그 사이 직원 B가 같은 대화를 열면 입력창이 비활성화되고 "자수르 님이 답변 중입니다 · 남은 시간 00:47" 배너와 카운트다운이 표시됩니다. 카운트다운이 끝나면 자동으로 입력창이 열립니다.
3. 대화 목록에도 잠긴 대화에 "🔒 답변 중" 배지를 표시해 열기 전에 알 수 있습니다.
4. 서버 최종 검증: 화면이 오래돼 잠금을 못 봤더라도, 전송 시점에 서버가 잠금을 다시 확인해 다른 사람의 잠금이 살아 있으면 전송을 막고 "다른 담당자가 답변 중입니다 (n초 후 가능)" 오류를 반환합니다 → 동시 발송 원천 차단.
5. 잠긴 본인은 계속 연속 답장 가능하며, 보낼 때마다 1분이 갱신됩니다. 완료 처리하면 잠금은 즉시 해제됩니다.
6. 관리자는 잠금과 무관하게 전송 가능(예외 처리).

## 기술 상세

- DB: `telegram_chats`에 `reply_lock_by uuid`, `reply_lock_at timestamptz` 컬럼 추가. 잠금 유효 = `now() - reply_lock_at < 60초`.
- `src/lib/telegram.functions.ts`
  - `sendTelegramReply`, `sendTelegramMedia`: 텔레그램 전송 **전에** 조건부 UPDATE로 잠금 획득
    (`reply_lock_by is null OR reply_lock_by = me OR reply_lock_at < now() - interval '60 seconds'`).
    갱신된 행이 없으면 전송 없이 남은 초와 함께 에러 반환. 성공 시 `reply_lock_at = now()`로 갱신.
  - `setTelegramChatStatus`가 `done`이면 잠금 해제(`reply_lock_by = null`).
- UI(`src/routes/telegram.tsx`): 목록/상세 쿼리에 두 컬럼 추가, 기존 realtime 구독으로 즉시 반영. 남은 시간은 1초 간격 로컬 타이머로 카운트다운, 0이 되면 입력창 활성화. 전송 실패 시 toast로 사유 안내.
