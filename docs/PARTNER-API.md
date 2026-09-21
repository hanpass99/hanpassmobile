# 파트너 신청 연동 API (append-only, v1)

**현재 상태: 비활성.** `PARTNER_API_ENABLED` 가 정확히 `"true"` 가 아니면 두 엔드포인트 모두
`503 integration_disabled` 을 반환하고 데이터베이스 모듈을 아예 불러오지 않습니다.

## 저장 모델

이 백오피스는 **신청 원장을 갖지 않습니다.** 원장·원문 스냅샷·멱등성 기록·실패/검토 건은
파트너(Railway)의 별도 암호화 저장소가 전담합니다. `public.customers` 에는 **새 신청의 운영용
사본 1행**만 들어갑니다.

이 API가 데이터베이스에 하는 일은 다음이 전부입니다.

- `public.customers` SELECT (파생된 id 한 건만), `public.countries` SELECT (code 정확 일치)
- `public.customers` INSERT 1행

UPDATE·DELETE·upsert·`ON CONFLICT`·DDL은 전혀 없습니다. 추가로 생기는 행은 기존 트리거가 만드는
상태 이력행뿐입니다. 신규 테이블도 만들지 않습니다.

## 인증

- `X-API-Key` → `PARTNER_API_KEYS` 로 partnerId 해석. 실패 시 401.
- `PARTNER_API_KEYS` 는 **JSON이 아니라** 환경변수 문자열입니다: `partnerId:key,partnerId:key`
  (partnerId는 ASCII `[a-z0-9_-]{1,64}`, 키 최소 32자, 짧거나 형식이 어긋나면 무시=fail-closed.
  같은 키가 서로 다른 partnerId에 중복 설정되면 모호하므로 인증 거부). 한 파트너에 키를 두 개 넣어
  무중단 회전이 가능하며, 키가 바뀌어도 고객 id는 바뀌지 않습니다. 비교는 전체 항목을 조기 종료
  없이 도는 상수시간 비교입니다.
- `PARTNER_API_ENABLED` / `PARTNER_API_KEYS` 는 **서버 라우트 핸들러 안에서 `process.env` 로만**
  읽습니다(클라이언트 번들·`import.meta.env` 아님).
- 키는 서버 환경에만 존재하며 코드·응답·로그에 노출되지 않습니다.
- CORS 헤더 없음(서버 간 전용), 모든 응답 `Cache-Control: no-store`, 요청 본문은 로그에 남기지 않습니다.

## 고객 id 파생 (UUID v8)

```
id = UUIDv8( SHA-256("hanpass-partner-application-v1\0" + partnerId + "\0" + externalApplicationId)[0..15] )
```

- **API 키가 회전해도 id는 바뀌지 않습니다**(키는 해시 입력이 아님).
- 파트너별·외부ID별로 공간이 분리됩니다.
- 요청자가 고객 UUID를 직접 제공하거나 임의 id로 조회하는 경로는 없습니다. 항상 서버가 재계산합니다.

## notes 표식

`customers.notes` 첫 줄:

```
HANPASS_PARTNER_V1:<base64url(JSON{partnerId,externalApplicationId,idempotencyKey,requestHash})>
```

이는 **인증 수단이 아니라 추가 무결성 확인**입니다. 둘째 줄부터는 직원이 읽을 한국어 문장으로
유입/언어/상품코드/유형/상품명/통신사/월요금/단말기·가격/결합요금제/약정/동의버전·시각/국적을 보존합니다.
표식이 직원 편집으로 훼손되면 **복구·수정·덮어쓰기를 하지 않고 안전하게 거부**합니다(POST 409,
GET 404).

## POST /api/public/applications

헤더: `X-API-Key`, `Idempotency-Key`, `Content-Type: application/json`.
**이 API는 파트너별 외부ID 자체가 멱등키입니다.** `Idempotency-Key` 는 `externalApplicationId`
와 동일한 UUID여야 하며 다르면 400.

본문(camelCase): `externalApplicationId`(Railway가 만든 **UUID v4만** 허용), `source`
(`nh_allone`|`hanpass_web`), `locale`(14개: ko,en,zh,vi,ru,ne,km,id,my,th,mn,si,ja,lo),
`applicant{firstName, middleName(null 허용), lastName(null 허용), phone, nationality}`,
`product{code,type,name,carrier,monthlyFee,deviceModel,devicePrice,contractMonths,bundledPlanCode,currency}`,
`consent{accepted,version,acceptedAt}`, `submittedAt`.

- `bundle`: `carrier`/`monthlyFee`/`bundledPlanCode` 는 미정(null) 허용, `devicePrice: 0` 은 무료로 보존.
- 성(lastName)이 없는 신청자는 `firstName` 만으로 성명이 구성됩니다.
- `sim`: 단말기 필드 금지, `contractMonths` 는 null 허용, carrier·monthlyFee 는 필수.
- `nationality`: ISO 3166-1 alpha-2. **`ZZ` 는 기타**이며 `country_id = null` 로 들어갑니다(코드 추측 없음).

동작:

1. 파생 id로 SELECT. 행이 있고 표식이 partner/external/idempotency/hash까지 정확히 일치하면 `200 replayed`.
   하나라도 다르면 `409 marker_mismatch`(기존 정보 미변경).
2. 없으면 INSERT 1행:
   `id`(파생), `name`, `phone`(정규화), `pool=activation_request`, `status=new`,
   `application_date`/`signup_date` = `submittedAt` 의 **한국시간 날짜**, `requested_plan`=상품명,
   `monthly_fee`=월요금 또는 null, `customer_type`=`sim`|`bundle`, `country_id`=코드 정확 매칭,
   `assigned_to`=null, `call_round`=null, `notes`=표식+설명. → `201 created`.
3. `23505` 발생 시 **파생 id만** 다시 조회 — 우리 행이면 표식·해시 일치 시 `200 replayed`,
   그 외 기존 중복이면 `409 customer_duplicate`. **어떤 기존 고객도 자동 연결하지 않습니다.**

오류: 400 invalid_payload / idempotency_key_mismatch, 401, 409, 413(16KB 스트림 상한),
415, 500(일반), 503.

### 요청 해시 정규화 (v1 고정)

스키마 검증 후의 값에 기본값을 채우고, 전화번호를 정규화한 뒤, 키를 재귀적으로 정렬한 JSON의
SHA-256입니다. 공백·키 순서·전화번호 표기는 해시에 영향을 주지 않습니다. **원문 본문은 저장·로그하지 않습니다.**

## GET /api/public/applications/{externalApplicationId}

키 → partnerId → 파생 id → 표식의 외부 범위(partnerId·externalApplicationId·idempotencyKey) 검증
후에만 응답합니다. 반환값은 `applicationId`, `externalApplicationId`, `status`, `receivedAt`,
`requestId` 뿐이며 **이름·전화번호·notes·내부 상태 원문은 반환하지 않습니다.**

상태 매핑: `received`(new) / `in_progress`(in_progress, no_answer, callback, certificate_issuing) /
`activated`(activated, contract_active) / `rejected`(rejected, not_interested, wrong_application,
minor, line_exceeded, delinquent) / `cancelled`(stay_expired, suspended_number).
그 밖의 값은 **`unknown`** 으로 반환하며 `received` 로 위장하지 않습니다.

## 운영 화면

별도 메뉴는 필요 없습니다. 기존 **개통 신청자** 목록에 그대로 나타나며, 요금제명은 신청요금제 열,
언어·유입·상품 상세는 메모에서 확인합니다.

## 아직 남은 일 (별도 승인 필요)

시크릿 등록(`PARTNER_API_ENABLED`, `PARTNER_API_KEYS`), Publish, 실제 DB를 상대로 한 종단간 검증.
`docs/sql/partner-applications-draft.sql` 은 **폐기 문서**이며 절대 실행하지 않습니다.
