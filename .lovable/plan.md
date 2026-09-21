# 한패스 모바일 상품 신청페이지 ↔ 백오피스 연동

조이님 문의 4가지에 대한 현재 상태와, 연동을 위해 추가할 것을 정리했습니다.

## 지금 상태 (질문에 대한 답)

1. **백엔드 종류**: Lovable Cloud (Supabase/PostgreSQL) 기반입니다.
2. **신청 등록 API**: **아직 없습니다.** 지금 신청 데이터가 들어오는 경로는 구글폼 자동 동기화, QR 신청 시트, 통화기록 수신, 텔레그램뿐입니다. 외부 사이트가 직접 신청을 넣을 수 있는 공개 API는 만들어야 합니다.
3. **상품 ID 목록**: **상품(요금제) 테이블이 없습니다.** 현재는 요금제를 `요금제명(텍스트)`로만 저장합니다. 상품 ID로 주고받으려면 상품 목록 테이블을 새로 만들어야 합니다.
4. **테스트 환경**: 운영과 분리된 미리보기 주소가 이미 있어, 그쪽으로 테스트 키를 따로 발급해 드리면 됩니다. 계정 공유 없이 키만 전달하는 방식이라 안전합니다.

## 만들 것

### 1. 신청 접수 API (신규)

- 주소: `/api/public/applications` (POST, JSON)
- 인증: 서버에 보관하는 비밀키를 `X-API-Key` 헤더로 전달 (메시지로 키를 주고받지 않음 — 조이님 요청대로 서버 환경에 설정)
- 접수되면 백오피스 "개통 신청자" 목록에 즉시 나타나고, 기존 자동 담당자 배정 규칙이 그대로 적용됩니다.
- 같은 이름+전화번호가 이미 있으면 새로 만들지 않고 "중복"으로 응답 (기존 중복 방지 규칙과 동일)

**필수 항목**: 성명, 전화번호, 상품(상품 ID 또는 요금제명)
**선택 항목**: 생년월일, 이메일, 국적(국가 코드), 신청일, 판매점명, 월 요금, 유심/단말기 구분, 비고

**응답**: 접수 성공 시 신청 ID와 상태(신규 접수/중복)를 돌려줍니다.

### 2. 상품 목록 API + 상품 테이블 (신규)

- 주소: `/api/public/products` (GET) — 상품 ID, 통신사, 상품명, 데이터, 월 요금, 할인가, 노출 여부
- 신청페이지는 이 목록을 그대로 쓰면 되고, 상품이 바뀌어도 백오피스에서만 수정하면 됩니다.
- 초기 데이터는 지금 신청페이지에 올라간 상품(라이트49, 한패스 1GB+ 등)을 기준으로 등록합니다. **정확한 전체 상품 목록을 주시면 그대로 넣겠습니다.**

### 3. 연동 문서

`API 연동 가이드` 문서를 만들어 전달합니다: 주소, 인증 방법, 항목 표(필수/선택/형식), 예시 요청·응답, 오류 코드, 테스트 방법.

## 기술 상세

- `src/routes/api/public/applications.ts` — `createFileRoute` + `server.handlers.POST`. `X-API-Key`를 `PARTNER_API_KEY` 시크릿과 타이밍 세이프 비교, Zod 검증, 실패 시 401/400.
- 전화번호는 기존 `normalizePhone` 규칙 재사용, `customers` 에 `pool='activation_request'`, `channel_id`= '개통 신청자', `status='new'` 로 insert. `customers_activation_request_dedup_idx` 충돌 시 기존 행 id 반환.
- insert 후 기존 `auto_assign_customer` 호출로 담당자 배정.
- 신규 테이블 `public.products` (code, carrier, name, data_amount, monthly_fee, discounted_fee, product_type(sim/device), is_active, sort_order) + GRANT/RLS: 관리자만 쓰기, `anon` SELECT는 `is_active` 한정. `customers.product_id` 컬럼 추가(널 허용, 기존 `requested_plan` 텍스트는 유지).
- 모든 요청은 `partner_api_logs` 에 원문 기록(진단용, 30일 보관) — 통화 로그 수신과 동일한 방식.
- 시크릿은 `add_secret` 로 등록. 운영/미리보기 각각 키 발급 가능.
