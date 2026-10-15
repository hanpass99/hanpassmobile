# 접수 API 국가 매칭 수정 (확정 범위)

## 점검 결과 요약
- 국가는 `src/routes/api/public/applications.ts:159-167` 한 곳에서만 정함: ZZ면 null, 아니면 `countries.code` 정확 일치, 없으면 조용히 null.
- 목 데이터 재현: UZ→null, RU→null, VN→매칭, ZZ→null.
- 현재 API에는 CIS로 바꾸는 경로가 없음 → 이미 CIS로 저장된 UZ 7건·RU 1건은 접수 후 직원이 고친 것으로 판단.
- 구글폼 쪽 `CIS_CODES {UZ,KZ,KG,TJ,RU}`(`google-form-sync.functions.ts:616`)는 내부 전용 → 건드리지 않고 같은 규칙만 복제.
- `countries`에 `is_active` 칸 있음 → 활성 행만 매칭.

## 변경 내용 (코드만)
1. `src/lib/partner-api.ts`: `PARTNER_CIS_CODES`와 `countryLookupCode(n)` 추가(CIS 5개국→"CIS", 나머지 원문). 스키마·해시·메모의 국적 원문은 그대로.
2. `src/routes/api/public/applications.ts` 순서 유지: 플래그→인증→형식→Zod→멱등키→해시/파생 id→기존 행 조회→기존이면 종전 규칙대로 replayed/409(국가 검사 전, 과거 ZZ 포함, UPDATE 없음).
3. 신규 건만: ZZ면 422 `unsupported_nationality`(field `applicant.nationality`). 그 외 `countries` 를 `code = countryLookupCode(n)` + `is_active = true` 로 조회 → 없으면 422, 조회 오류면 500, INSERT 0회.
4. 23505 재조회 경로는 기존 그대로.
5. 테스트(목 전용, `tests/partner-api.mock.test.ts` 확장 + 단위 테스트): UZ/RU/KZ/KG/TJ→CIS id 저장, VN/KR 직접 매칭, 새 ZZ/미등록 XX/비활성 국가→422+INSERT 0, 국가 조회 오류→500+INSERT 0, 기존 ZZ 행 재전송 replayed(같은 id/hash), 기존 충돌·인증 테스트 유지.
6. `docs/PARTNER-API.md` 국가 규칙 갱신, roadmap 항목 추가.
7. 검증: 테스트, 타입검사, 빌드, `supabase/` 변경 0건 확인.

DB 데이터·구조·국가 목록·기존 행·시크릿·구글폼 코드 변경 없음, 운영 POST 없음, Publish 안 함.
