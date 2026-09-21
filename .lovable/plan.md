# 외부 HANPASS 신청 사이트 연동 — 수정 설계 및 API 계약 (설계 문서 전용)

본 문서는 설계와 API 계약만 정합니다. 코드·DB·시크릿·배포 변경은 이 단계에서 수행하지 않습니다.

## 0. 현황 (읽기 전용 점검 결과)

- 신청 등록용 API는 **미구현** 상태입니다. `/api/public/` 아래에는 `call-log`, `telegram/webhook`, `ai-learn/run`만 있습니다.
- 외부 사이트 → 백오피스 신청 데이터 경로는 아직 없습니다.
- 이전에 남아 있던 미커밋 변경·연동 마이그레이션은 없습니다.
- **테스트 DB와 테스트 키는 현재 존재하지 않습니다. 따라서 이번 단계에서 "연동 완료"라고 표기할 수 없습니다.**

## 1. 테스트 환경 — 독립 프로젝트/DB 구성 (is_test 방식 폐기)

- 폐기: 운영 DB `customers.is_test` 추가, 목록 필터 변경, 테스트 신청 삽입/삭제 안. **운영 DB에 테스트 데이터를 넣지 않습니다.**
- 이유: 미리보기와 운영이 같은 백엔드 인스턴스 하나를 공유하므로, 같은 DB 안의 어떤 표시 방식도 운영 데이터 오염 위험을 없애지 못합니다.
- 이 계정에서 가능한 방법:
  1. 이 워크스페이스에 **별도 테스트 프로젝트를 새로 만들고** 동일한 마이그레이션을 적용합니다(Lovable Cloud 프로젝트마다 자체 DB 인스턴스가 생깁니다). 이 프로젝트 코드를 복사한 뒤 별도 테스트 키로 운영합니다. Railway 쪽도 "테스트 엔드포인트 주소 + 테스트 키"를 지정하면 완전 분리됩니다.
  2. (대안) 이 프로젝트 안에서는 분리된 백엔드를 만들 수 없으므로, 테스트 프로젝트 생성이 준비될 때까지 연동은 "코드 완성·비활성" 상태로 둡니다.
- **분리 전 허용 범위 명시**: 독립 테스트 DB가 생기기 전에는 **순수 단위 테스트와 mock 기반 통합 테스트만** 가능합니다(실제 DB 접속·실데이터 생성 금지). 종단간 실호출 테스트는 테스트 프로젝트가 생긴 뒤에만 합니다.

## 2. `partner_applications` — 신청 원장 설계

고객 원장(`customers`)과 **신청 원장**을 분리합니다. 기존 고객과 신규 신청을 구분하고, 기존 고객에 연결되더라도 신청별 내역은 반드시 별도 행으로 보존합니다.

### 컬럼
| 컬럼 | 의미 |
|---|---|
| `partner_id` | 파트너 식별(키와 매핑). 멀티 파트너 대비 |
| `external_application_id` | 파트너의 신청 고유번호 |
| `idempotency_key` | 요청 헤더의 멱등성 키 |
| `request_hash` | 정규화된 요청 본문의 해시(SHA-256) — 원문 대신 비교용 |
| `customer_id` | 연결된 고객(`customers.id`). 신규 생성 또는 기존 매칭 |
| `product_snapshot` | 신청 시점 상품 정보 JSON(코드·유형·상품명·통신사·요금·단말기 정보 등) — 가격은 Railway 서버가 자체 상품 원장에서 검증해 전달한 값을 신뢰 |
| `locale` | 신청 언어 |
| `source` | 유입 출처(예: `hanpass-mobile-railway`) |
| `consent_version`, `consent_accepted_at` | 동의 문구 버전과 동의 시각 |
| `received_at` | 백오피스 수신 시각 |

고유 제약: `(partner_id, external_application_id)` UNIQUE, `(partner_id, idempotency_key)` UNIQUE.

### 보관 원칙
- **요청 원문(raw body) 전체 로그는 보관하지 않습니다.** 오류 진단은 `request_hash`와 구조화된 오류 코드로만 합니다.
- 상품은 신청마다 `product_snapshot`으로 보존하므로, 한 고객이 상품을 바꿔 다시 신청해도 각 신청이 독립 행으로 남습니다.

### 고객 연결 규칙
- 신청 수신 시 전화번호 정규화(기존 `normalizePhone` 규칙 재사용) 후 동일 번호의 기존 고객이 있으면 `customers`를 새로 만들지 않고 `customer_id`로 연결만 하고, 상품·신청 내용은 `partner_applications` 행에 보존합니다.
- 기존 고객이 없으면 `customers`에 `pool='activation_request'`, `status='new'`로 생성 후 연결.
- **기존 (이름+번호+신청일) 중복 인덱스를 멱등성 수단으로 쓰지 않습니다.** 그 인덱스에 의존하면 같은 사람의 다른 상품 신청이 유실됩니다. 멱등성은 아래 키/해시 규칙으로만 처리합니다.

### 멱등성·동시성 규칙
- `(partner_id, idempotency_key)` 기준:
  - 동일 키 + 동일 내용(`request_hash` 일치) → 재처리 없이 기존 결과를 반환(`result: "replayed"`).
  - 동일 키 + 다른 내용 → **HTTP 409** (`error: "idempotency_key_conflict"`).
- `(partner_id, external_application_id)` 충돌(같은 신청번호를 다른 키로 재전송) → 내용 동일하면 기존 건 반환, 다르면 409 (`error: "external_application_id_conflict"`).
- 동시 요청: DB 고유 제약을 최종 방어선으로 사용합니다. 삽입과 조회를 하나의 트랜잭션(또는 `INSERT ... ON CONFLICT` 후 재조회)으로 처리해 경쟁 상태에서도 한 건만 생성되고 나머지는 기존 결과를 반환합니다.

## 3. 담당자 배정 규칙 (미정 — 임의 배정 금지)

- 담당자 자동 배정의 실제 비즈니스 규칙이 아직 정해지지 않았으므로, **이 연동은 어떤 임의 배정도 하지 않습니다.**
- 동작 명세: 접수 성공 시 `customers`는 **미배정(`assigned_to` NULL)** 상태로 저장되고, 백오피스 화면에서 **운영자가 수동 배정**합니다(기존 구글폼 유입과 동일한 형태).
- 향후 자동 배정이 필요해지면 확인할 질문:
  1. 배정 대상 풀: 어느 소속/부서 직원에게 배정할지(한패스 소속? 특정 부서?)
  2. 배정 방식: 라운드로빈 / 국적(언어)별 전담 / 업무량 균등 / 접수 시간대별 근무자 중 어느 것인지
  3. 신청의 국적(`nationality`)과 직원의 담당 국가(`profile_countries`)를 매칭할지
  4. 미배정 상태를 유지해야 하는 경우(예: 검토 필요 상품)가 있는지
  5. 재신청(기존 고객)인 경우 이전 담당자에게 배정할지

## 4. 외부 API 계약 (확정안)

### 공통
- Base: 운영 `https://project--{id}.lovable.app`, 테스트(분리 프로젝트 생성 후) 해당 프로젝트의 주소.
- 인증: 서버 간 `X-API-Key` 헤더. 키는 서버 환경에만 저장(메시지로 전달 금지). 파트너별 키 발급 — 키가 곧 `partner_id`와 매핑되어 **파트너 범위 조회**(자기 파트너의 신청만 조회 가능)를 강제합니다.
- 모든 필드명은 **camelCase**입니다.

### POST /api/public/applications
헤더: `X-API-Key`, `Idempotency-Key`(필수), `Content-Type: application/json`

요청 본문:
```json
{
  "externalApplicationId": "hp-20260921-0001",
  "source": "hanpass-mobile-railway",
  "locale": "ko",
  "applicant": {
    "firstName": "길동",
    "middleName": null,
    "lastName": "홍",
    "phone": "010-1234-5678",
    "nationality": "MNG"
  },
  "product": {
    "code": "T-LIGHT49",
    "type": "sim",
    "name": "T 라이트49",
    "carrier": "SKT",
    "monthlyFee": 26750,
    "deviceModel": null,
    "devicePrice": null,
    "contractMonths": 12,
    "bundledPlanCode": null,
    "currency": "KRW"
  },
  "consent": {
    "accepted": true,
    "version": "privacy-v3",
    "acceptedAt": "2026-09-21T07:00:00Z"
  },
  "submittedAt": "2026-09-21T07:00:05Z"
}
```

규칙:
- `product.type`은 `"sim"` 또는 `"bundle"`. `bundle`일 때만 단말기 필드(`deviceModel`, `devicePrice`, `bundledPlanCode`)가 의미를 가집니다.
- **금액의 `null`과 `0`을 구분합니다.** `null` = 해당 없음/미제공(예: 유심 상품의 단말기 가격), `0` = 실제 0원(무료). 스키마에서 둘을 구별해 검증·저장합니다.
- 상품 가격·유효성은 **Railway 서버가 자체 상품 원장에서 검증한 값을 그대로 전달**하며, 백오피스는 재검증 없이 `product_snapshot`으로 보존합니다(상품 원장 이중 관리 없음).
- `consent.accepted`가 `true`가 아니면 400으로 거부합니다.

성공 응답 `201`(신규) / `200`(재전송):
```json
{
  "applicationId": "8f4c…(partner_applications.id)",
  "externalApplicationId": "hp-20260921-0001",
  "result": "created",
  "status": "received",
  "receivedAt": "2026-09-21T07:00:06Z",
  "requestId": "req_…"
}
```
- `result`: `created` | `replayed`
- `status`: 백오피스 처리 상태(`received` → 처리중 → 개통 완료 등)
- `requestId`: 진단용 상관관계 ID(로그 추적용; 원문 로그는 저장하지 않음)

오류 응답: 400(검증 실패, 필드별 사유) / 401(키 없음·불일치) / 409(멱등성·신청번호 충돌) / 500. 오류 본문: `{ "error": "코드", "requestId": "…" }`.

### GET /api/public/applications/{externalApplicationId}
헤더: `X-API-Key`. **자기 파트너의 신청만 조회 가능**합니다(키→`partner_id` 범위 강제).

응답:
```json
{
  "applicationId": "8f4c…",
  "externalApplicationId": "hp-20260921-0001",
  "status": "processing",
  "receivedAt": "2026-09-21T07:00:06Z",
  "requestId": "req_…"
}
```
- **내부 개인정보(성명·전화번호 원문)와 상담 메모 등 내부 정보는 반환하지 않습니다.** 상태와 시각만 반환합니다.
- 없는 신청이거나 다른 파트너의 신청이면 404(존재 여부 노출 방지).

## 5. Fail-closed 기본 구성과 롤백

- 기본 비활성: 키가 서버 환경에 설정되지 않으면 두 엔드포인트는 **항상 401**(fail-closed). 키가 등록·배포되기 전에는 어떤 요청도 처리되지 않습니다.
- 활성화 순서: (1) 테스트 프로젝트 DB 생성 → (2) 테스트 키 설정 → (3) 테스트 프로젝트에서 종단간 검증 → (4) 운영 키 설정 → (5) 운영 활성화. 4~5 이전까지 운영 엔드포인트는 비활성 상태로 배포만 된 상태.
- 운영 롤백 절차:
  1. 키 제거(또는 키 교체)로 즉시 접수 차단 — 코드 되돌리기 없이 30초 내 차단.
  2. 코드 제거가 필요하면 엔드포인트 파일 제거 후 재배포.
  3. DB 롤백: `partner_applications` 테이블은 신규 테이블이므로 기존 테이블에 영향이 없고, 이전 스키마로 되돌리는 마이그레이션으로 제거 가능. `customers`에는 기존 컬럼만 사용하므로 스키마 롤백 필요 없음.
- 연동 상태 표기: 테스트 DB와 운영 키가 실제로 구성되어 종단간 검증을 마치기 전까지 "연동 완료"로 표기하지 않습니다. 완료 조건은 테스트 환경에서의 created/replayed/409/상태조회 검증 통과입니다.

## 6. 구현 범위 요약 (승인 후 진행할 것)

- 서버 라우트 2개(`src/routes/api/public/applications.ts`, `applications.$externalApplicationId.ts`) — 기존 `call-log.ts` 패턴(핸들러 내부 동적 admin import, Zod 검증, 타이밍 세이프 키 비교).
- 마이그레이션 1건: `public.partner_applications` + 고유 제약 2개 + GRANT(service_role, 관리자 조회용 authenticated) + RLS. `customers` 스키마 변경 없음, 상품 테이블 없음, `is_test` 없음.
- 테스트: 순수 단위 테스트(정규화·해시·스키마 검증) + mock 기반 통합 테스트(삽입/재전송/충돌/동시성 시나리오). 실DB 종단간 테스트는 테스트 프로젝트 생성 후.
- 연동 가이드 문서 1부(주소, 인증, 항목표, 예시, 오류 코드, 재전송 규칙, 파트너 범위 조회).
