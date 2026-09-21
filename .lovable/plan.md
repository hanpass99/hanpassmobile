# 외부 HANPASS 신청 사이트 연동 — 현황 점검(읽기 전용) 및 최소 변경안

이번 점검에서는 코드·DB·시크릿을 전혀 바꾸지 않았고, 조회만 했습니다.

## 1. 프레임워크와 외부 API 현황

- 프레임워크: TanStack Start v1 + React 19 + Vite 7, SSR은 Cloudflare Workers (`package.json`, `wrangler.jsonc`, `src/server.ts`).
- 외부 호출용 엔드포인트는 `src/routes/api/public/` 아래 파일 라우트 방식입니다. 현재 존재하는 것은 3개뿐입니다.
  - `src/routes/api/public/call-log.ts` (통화기록 수신)
  - `src/routes/api/public/telegram/webhook.ts`
  - `src/routes/api/public/ai-learn/run.ts`
- **`/api/public/applications` 및 신청 등록용 API는 존재하지 않습니다.** 신청 데이터가 들어오는 경로는 구글폼/QR 시트 동기화(`src/lib/google-form-sync.functions.ts`), 텔레그램, 통화기록뿐입니다.
- 인증 참고 모델: `call-log.ts`는 `AUTOMATE_WEBHOOK_TOKEN` 환경값과 `x-automate-token`(또는 Bearer) 헤더를 비교합니다. 신규 연동도 같은 방식이 자연스럽습니다.

## 2. 신청 데이터 관련 실제 동작

- 고객 원장: `public.customers`. 신청 구분은 `pool` 값이며 "개통 신청자"는 `activation_request` 입니다(화면 탭: `src/routes/customers.lazy.tsx` 304행대, 1410행대).
- 채널 자동 지정: DB 트리거 `set_channel_from_pool` — `pool='activation_request'` 이면 채널 "개통 신청자"를 자동 연결.
- 담당자 자동 배정: DB 트리거 `auto_assign_customer` (BEFORE INSERT/UPDATE). **INSERT 시 `auth.uid()` 기준으로 배정**하므로, 서버 키로 들어오는 외부 신청은 `auth.uid()`가 없어 담당자 미배정 상태로 들어옵니다(구글폼 유입과 동일한 형태). 이는 정상 동작이며 화면에서 배정하면 됩니다.
- 중복 방지 인덱스(실제 DB 확인):
  - `customers_activation_request_dedup_idx` → (name, phone, signup_date), `pool='activation_request'` 한정
  - `customers_friend_referral_dedup_idx` → (name, phone)
  - `customers_google_form_inter_dedup_idx` → (name, phone)
- 전화번호 정규화: `normalizePhone` — `src/lib/google-form-sync.functions.ts` 48~61행. 숫자만 남기고 `010-0000-0000` / `8210-0000-0000` 형태로 변환, 형식이 아니면 `null`. 같은 이름의 함수가 `call-log.ts`, `telegram.server.ts`에도 각각 있습니다(현재 공용 모듈 없음).

## 3. 미리보기 / 운영 환경 분리

- **DB와 시크릿은 분리되어 있지 않습니다.** 미리보기와 운영이 같은 백엔드 인스턴스 하나를 공유합니다. 즉, 미리보기에서 만든 신청도 운영 목록에 그대로 보입니다.
- 주소만 다릅니다: 미리보기 `id-preview--…lovable.app`, 운영 `hanpassmobile.lovable.app`.
- 따라서 "운영 데이터를 건드리지 않는 독립 테스트 환경"은 현재 없습니다. 아래 5번에서 대안을 제시합니다.

## 4. 중단된 외부 연동 작업 상태

- 코드/DB 변경은 **하나도 없습니다.** 작업 트리에 미커밋 변경 없음, 관련 마이그레이션 없음.
- 남아 있는 것은 계획 문서 `.lovable/plan.md`(이 파일 이전 내용)뿐입니다. 거기에는 상품 테이블을 BO에 만드는 안이 포함돼 있었는데, 이번 방침(상품 원장은 Railway 사이트에서 관리)에 따라 **상품 테이블 안은 폐기**합니다.

## 5. 최소 변경안 (승인 시 진행)

상품 원장은 만들지 않고, 신청 접수·멱등성·상태 조회 3가지만 추가합니다.

### 5-1. 신청 접수 `POST /api/public/applications`
- 인증: 서버에 보관한 키를 `X-API-Key` 헤더로 검증(메시지로 키 전달 없음). 운영/테스트용 키 2개 분리.
- 필수: 성명, 전화번호, 상품 식별자(Railway 쪽 상품 코드·상품명 문자열 그대로 저장)
- 선택: 생년월일, 이메일, 국가 코드, 신청일, 판매점명, 월 요금, 유심/단말기 구분, 비고
- 저장: `customers`에 `pool='activation_request'`, `status='new'`, 상품은 기존 `requested_plan` 텍스트에 저장(신규 컬럼·신규 테이블 없음).

### 5-2. 멱등성
- 외부에서 보내는 `external_id`(신청 고유번호)를 받아 재전송 시 중복 생성하지 않고 기존 건을 그대로 반환.
- 1차 방어는 기존 `customers_activation_request_dedup_idx`(이름+번호+신청일) 충돌 처리, 2차는 `external_id` 기록용 얇은 테이블 1개(`partner_applications`: external_id, customer_id, 요청 원문, 결과, 생성시각). 이 테이블은 상품 원장이 아니라 연동 로그·멱등성 키 저장용입니다.

### 5-3. 상태 조회 `GET /api/public/applications/{external_id}`
- 같은 키 인증. 반환: 접수 상태(신규/처리중/개통 완료 등), 최종 변경 시각. **개인정보 원문은 반환하지 않습니다.**

### 5-4. 테스트 방법 (환경 분리가 없으므로)
- 테스트 요청은 별도 테스트 키로 보내고, 그 키로 들어온 건은 `is_test` 표시를 붙여 저장 → BO 목록·통계에서 기본 제외, 필요 시 일괄 삭제.
- 미리보기 주소로 테스트하되 같은 DB임을 전제로 진행.

### 5-5. 문서
- 연동 가이드(주소, 인증, 항목표, 예시 요청·응답, 오류 코드, 재전송 규칙) 1부 작성해 전달.

## 기술 상세

- 신규 파일: `src/routes/api/public/applications.ts`, `src/routes/api/public/applications.$externalId.ts` — `createFileRoute` + `server.handlers`, Zod 검증, 타이밍 세이프 키 비교, `supabaseAdmin`은 핸들러 내부 동적 import(기존 `call-log.ts` 패턴 동일).
- `normalizePhone`을 공용 모듈(`src/lib/phone.ts`)로 추출해 재사용(기존 호출부 동작 동일).
- 마이그레이션 1건: `public.partner_applications` 생성 + GRANT(service_role 전체, authenticated SELECT) + RLS(관리자 조회만), `customers.is_test boolean not null default false` 추가 및 기존 목록 쿼리에 기본 필터.
- 시크릿 2개(`PARTNER_API_KEY`, `PARTNER_API_KEY_TEST`)는 승인 후 보안 입력창으로 등록.
