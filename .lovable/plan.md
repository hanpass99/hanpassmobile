## 목표

CIS팀이 고객과 텔레그램으로 소통할 때, 5명의 직원 중 **누가 어떤 답장을 보냈는지** CRM에서 추적할 수 있게 합니다. 새 공식 텔레그램 봇을 만들고, 모든 대화를 CRM 안 채팅 UI에서 주고받도록 구축합니다.

## 최종 사용자 흐름

**고객 측**
1. 고객이 새 봇(예: @HanpassMobileBot)과 대화 시작 → "전화번호 공유하기" 버튼 표시.
2. 고객이 전화번호 공유 → 시스템이 CRM의 `customers.phone`과 자동 매칭. 실패 시 관리자/직원이 CRM에서 수동 연결.
3. 이후 모든 메시지는 봇을 통해 CRM으로 유입.

**직원 측 (CRM 내부)**
1. 사이드바에 새 메뉴 **"텔레그램 상담"** 추가.
2. 좌측: 최근 대화 순 고객 목록 (미읽음 배지, 마지막 메시지, 국가 필터).
3. 우측: 카톡/텔레그램 스타일 대화창.
   - 고객 메시지 = 회색 좌측 말풍선.
   - 직원 답장 = 우측 말풍선 + **답장한 직원 이름/아바타** 표시.
4. 직원이 CRM에서 답장 → 봇을 통해 고객 텔레그램으로 발송 + DB에 `sent_by = 로그인 직원 ID` 기록.
5. 각 대화는 CRM 고객 상세 페이지에서도 미니뷰로 열람 가능.

## 매칭 정책

- **1차 (자동):** 첫 대화 시 봇이 "전화번호 공유" 버튼(`request_contact`) 발송 → 공유 시 `customers.phone`과 매칭 → 성공 시 자동 연결.
- **2차 (수동):** 자동 매칭 실패 시 대화방이 "미매칭" 섹션에 표시 → 직원이 CRM 고객을 선택해 수동 연결.
- 매칭 후 텔레그램 `chat_id` ↔ `customer_id` 관계는 영구 저장.

## 데이터 모델 (신규 테이블)

| 테이블 | 용도 |
|---|---|
| `telegram_chats` | chat_id, customer_id(nullable), telegram_username, first_name, last_login, unread_count |
| `telegram_messages` | chat_id, direction(in/out), text, media_url, sent_by(직원 uuid, out일 때만), telegram_message_id, created_at, read_at |

RLS: 인증된 직원 모두 읽기/쓰기, 관리자 전체 접근. GRANT는 authenticated + service_role.

## 인프라

1. **관리자가 BotFather에서 새 봇 생성** → `TELEGRAM_BOT_TOKEN` secret 저장 (add_secret 흐름).
2. **Webhook 엔드포인트**: `src/routes/api/public/telegram/webhook.ts`
   - Telegram 시크릿 토큰 검증.
   - 인입 메시지 저장 + Supabase realtime으로 CRM에 푸시.
3. **발신 서버 함수**: `sendTelegramMessage` (createServerFn, `requireSupabaseAuth`)
   - 로그인 직원 ID를 `sent_by`로 기록.
   - Telegram Bot API `sendMessage` 호출.
4. **첫 웹훅 등록**: 배포 후 `setWebhook` 1회 호출 (sandbox curl).

## 화면/코드 변경

- **신규 라우트**: `src/routes/telegram.tsx` (풀 채팅 UI — AI Elements의 Conversation/Message/PromptInput 활용).
- **신규 컴포넌트**: `TelegramChatList`, `TelegramChatWindow`, `UnmatchedChatBanner`.
- **사이드바**: `AppSidebar.tsx`에 메뉴 항목 + 미읽음 뱃지 추가.
- **고객 상세 페이지**: 텔레그램 대화 미니뷰 탭 추가.
- **i18n**: ko/en 라벨 추가.
- **실시간 업데이트**: Supabase realtime 채널 (`telegram_messages` insert 구독).

## 마이그레이션 및 이행

- CIS팀에게 안내: 기존 공용 계정에 "앞으로는 새 공식 봇으로 문의 부탁드립니다" 자동 응답 설정.
- 새 봇 사용자 이름/링크를 고객 안내 문구, 문자 템플릿에 반영 (별도 요청 시).

## 범위 제외 (필요 시 추후)

- 이미지/파일/음성 메시지 (1차는 텍스트만).
- 다중 봇 지원.
- 그룹 채팅.
- 자동 응답 / AI 자동 답장.

이 계획으로 진행해도 될까요?