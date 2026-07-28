## 목표

CIS 팀 텔레그램 상담에서 고객의 간단한 질문은 AI가 스스로 판단해 즉시 답장하고, 애매한 질문은 담당자에게 넘겨 확인받도록 합니다. 관리자는 시간이 지날수록 AI를 계속 교육시켜 정확도를 높일 수 있습니다.

## 핵심 정책

- **자동 발송**: 상담사 확인 없이 AI가 바로 답장 (Bot 명의).
- **AI 표시 의무**: AI가 보낸 답장은 고객 화면과 상담사 화면 모두에서 🤖 로봇 아이콘 + "자동 응답" 라벨로 명확히 구분.
- **애매하면 침묵**: 확신도가 낮으면 답장하지 않고 상담사에게 그대로 넘김 (기존 "신규" 배지 유지).
- **24시간 작동**: 업무 시간과 무관. 단, 업무 시간 외 자동 응답 문구는 AI 답장이 나갔을 때는 생략.
- **차단 가능**: 채팅방별로 상담사가 AI 자동 응답 on/off 토글.

## AI 지식 소스 (3가지 동시 활용)

관리자가 지속적으로 교육 → AI가 문맥 이해 → 자연스러운 답장 생성.

1. **FAQ 지식베이스** (신규): 관리자가 CRM에서 "질문 예시(여러 개) → 답변" 쌍을 계속 등록/수정. 같은 의미의 다양한 표현을 하나의 답변에 묶을 수 있음.
2. **과거 상담 이력**: `telegram_messages`에서 상담사가 실제로 보냈던 답변 패턴을 참고 (임베딩 유사도 검색).
3. **모델 자체 추론**: Hanpass Mobile 서비스 개요를 시스템 프롬프트로 제공. FAQ와 이력을 근거로 없는 정보는 지어내지 않고 "담당자 확인이 필요합니다"로 처리.

## 데이터 모델 (신규)

| 테이블 | 용도 |
|---|---|
| `ai_faq_entries` | 관리자 등록 FAQ. category, question_examples(text[]), answer_uz, answer_ru, is_active, embedding(vector) |
| `ai_reply_settings` | 채팅방별 AI on/off + 전역 기본값 (singleton row) |
| `ai_reply_logs` | AI가 검토한 모든 인입 메시지 로그. matched_faq_id, confidence, decision(sent/skipped_low_confidence/skipped_disabled), reply_text |

`telegram_messages`에 `is_ai_generated boolean` 컬럼 추가 → 말풍선에 🤖 배지 표시용.

## 동작 흐름

```text
고객 메시지 수신 (webhook)
  ↓
① 채팅방 AI on? 매칭된 고객? 차단 아님?  → No면 기존 흐름
  ↓ Yes
② FAQ + 과거 상담 이력 임베딩 검색 (top-K)
  ↓
③ Gemini에게 [시스템 프롬프트 + 검색된 근거 + 최근 대화 5턴 + 이번 질문] 전달
   → JSON 응답 { confidence: 0.0~1.0, reply: string | null, reason: string }
  ↓
④ confidence ≥ 0.75 → 텔레그램 전송 + is_ai_generated=true로 DB 기록
   confidence < 0.75 → 답장 없이 상담사에게 넘김 (신규 배지 유지)
  ↓
⑤ ai_reply_logs에 결정 이력 저장 (관리자 검토용)
```

**AI 표시**: 
- 고객 텔레그램: 답장 텍스트 맨 앞에 `🤖 ` 접두어.
- CRM 채팅창: AI 말풍선에 배경색 다르게 + "AI 자동 응답" 배지.

## UI 변경

**신규 라우트**: `src/routes/ai-faq.tsx` (관리자 전용)
- FAQ 목록 (카테고리별 그룹)
- 등록/편집 폼: 질문 예시 여러 개 입력, 답변 UZ/RU 필드, 활성화 토글
- 저장 시 백엔드에서 자동 임베딩 생성

**텔레그램 상담 화면 (`telegram.tsx`)**
- 채팅방 헤더에 "AI 자동 응답" 토글 스위치
- AI가 보낸 메시지 말풍선에 🤖 배지 + 근거 FAQ 이름 툴팁
- 우측 사이드 패널에 "AI 검토 로그" 탭 (skipped 사유 확인 → FAQ 개선 힌트)

**사이드바**: 관리자에게 "AI 학습" 메뉴 추가.

## 백엔드

- **웹훅 확장** (`src/routes/api/public/telegram/webhook.ts`): 인입 텍스트 메시지 저장 직후 `tryAiAutoReply()` 호출.
- **신규 서버 로직** (`src/lib/ai-reply.server.ts`):
  - `embedText()`: Lovable AI `google/gemini-embedding-001`로 임베딩.
  - `searchKnowledge()`: pgvector 유사도 검색 (FAQ + 최근 상담 이력).
  - `generateReply()`: Lovable AI `google/gemini-3.6-flash`로 구조화 응답(JSON).
  - `sendAiReply()`: 텔레그램 전송 + 로그 저장.
- **FAQ 관리 서버 함수** (`src/lib/ai-faq.functions.ts`): CRUD + 저장 시 임베딩 재계산.
- pgvector 확장 활성화 (마이그레이션 1회).

## 안전 장치

- 금액/개인정보/약관 관련 키워드(요금, 환불, 취소, 개인정보 등) 포함 시 confidence 무관 무조건 상담사에게 이관.
- 동일 채팅방에서 AI가 연속 3턴 답장했으면 4번째는 자동 이관 (봇 도돌이 방지).
- 관리자가 특정 AI 답장을 "잘못됨"으로 표시하면 해당 FAQ에 -1 점수 → 다음 유사 질문 시 confidence 하향.

## 범위 제외 (추후)

- 자동 이미지/파일 응답
- 다국어 자동 감지 (현재 채팅방의 `language` 필드 그대로 사용)
- 이번엔 KO 지원 안 함 (CIS 팀은 UZ/RU 기준)

이 계획으로 진행할까요? 특히 confidence 임계값(0.75)이나 "안전 키워드" 목록을 조정하고 싶으시면 말씀해 주세요.
