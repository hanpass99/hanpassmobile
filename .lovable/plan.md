# 접수 API 국가 누락 — 점검 결과와 최소 수정안

## 점검 결과 (읽기 전용)

**국가 결정 코드 (유일한 경로)**
- `src/lib/partner-api.ts:77-80` — `nationality`는 `/^[A-Z]{2}$/` 검사만 함. 별칭 변환 없음.
- `src/lib/partner-api.ts:609` — `UNKNOWN_NATIONALITY = "ZZ"`.
- `src/routes/api/public/applications.ts:159-167` — ZZ면 조회 안 하고 `null`, 아니면 `countries.code = nationality` 정확 일치 조회, 없으면 `null`(오류 아님).
- `applications.ts:185` — 그 값을 그대로 `country_id`로 INSERT.
- `partner-api.ts:664` — 메모에 `국적 XX` 원문 코드 기록(직원은 실제 국적 확인 가능).

**목 데이터 재현 (운영 DB 미접속)**
| 보낸 값 | 결과 | 이유 |
|---|---|---|
| UZ | null | DB에 UZ 행 없음, CIS 변환 없음 |
| RU | null | 동일 |
| VN | 매칭 | 정확 일치 |
| ZZ | null | 계약상 의도적 null |

**원인 구분**
- UZ 3건 null, RU null: API 정확 일치 조회의 한계(코드 원인).
- ZZ 2건 null: 의도된 계약대로.
- UZ 7건·RU 1건이 CIS로 저장된 것: 현재 API 코드는 CIS로 바꾸는 경로가 전혀 없으므로, 접수 후 직원의 수동 수정으로 판단됩니다(추정, 이름 없이 변경 이력만 읽어서 확인 가능).

**기존 별칭 유틸리티**
- `src/lib/google-form-sync.functions.ts:11-41` `COUNTRY_MAP` (UZ/KZ/KG/TJ/RU → CIS 등), `:616` `CIS_CODES = {UZ,KZ,KG,TJ,RU}`. 구글폼 전용 내부 상수라 내보내지 않음.

## 최소 수정안 (승인 후 진행)

1. `partner-api.ts`에 신규 API 전용 `PARTNER_CIS_CODES = {UZ, KZ, KG, TJ, RU}`와 `countryLookupCode(n)` 추가: CIS 국가면 `"CIS"`, 아니면 그대로. 구글폼 코드는 건드리지 않고 같은 규칙만 복제.
2. `applications.ts` 조회를 `countryLookupCode(nationality)`로 변경. 메모의 `국적 UZ` 원문 표기는 유지.
3. ZZ 차단(선택): 스키마에서 ZZ를 `400 invalid_payload (applicant.nationality)`로 거부. 신청 페이지에서도 기타 선택 제거. 단, 멱등 재전송 시 과거 ZZ 건은 이미 저장돼 있어 그대로 `replayed`가 나오는지 확인 필요 → 거부는 신규 INSERT 전 단계에서만 적용하고 기존 행 SELECT 재생은 먼저 수행하도록 순서 조정 여부 결정.
4. 선택: 매칭 실패(코드는 유효하나 countries에 없음)를 null로 조용히 넣지 않고 `422 unsupported_nationality`로 거부해 누락을 원천 차단.
5. 해시 정의는 원문 nationality 기준이라 변경 없음 → 기존 건 재전송 id/hash 동일.
6. 테스트: UZ/RU/KZ→CIS, VN 그대로, ZZ 거부, 매칭 실패 거부, 기존 건 재전송 replayed 유지.

기존 DB 행·스키마·시크릿·Publish는 변경하지 않습니다. 반영은 다음 Publish 이후부터 신규 신청에만 적용됩니다.

## 결정 필요
- ZZ: 차단(400) 할지, 계속 null 허용할지.
- 매칭 안 되는 유효 코드: 거부(422) 할지, null로 접수할지.
