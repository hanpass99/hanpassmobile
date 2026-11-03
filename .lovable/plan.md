# 한패스앱 신청자 — 농협 올원 유입 구분 (화면만 변경, DB 변경 없음)

## 현재 확인된 상태
- 한패스앱 신청자(activation_request) 중 메모에 `[파트너 신청] NH 올원`이 있는 고객: 22건, `[파트너 신청] 한패스 웹`: 777건.
- 목록은 `search_customers` 함수로 불러오며, 이 함수의 검색어는 메모(notes)를 검색하지 않습니다. 목록 행에는 메모가 이미 포함되어 있습니다.

## 화면 변경
1. **농협 배지**: 한패스앱 신청자 목록에서 메모에 `[파트너 신청] NH 올원`이 있으면 이름 옆에 작은 "농협" 배지 표시 (모바일 카드에도 동일). 다른 탭에는 표시하지 않음.
2. **유입 선택**: 한패스앱 신청자 탭 필터 줄에 "유입: 전체 / 농협 올원 / 한패스 웹" 추가. 기본값 "전체".
   - **전체**: 지금과 완전히 동일 (기존 함수 그대로, 화면 그대로).
   - **농협 올원 / 한패스 웹**: 이 선택일 때만 고객 표를 직접 조회(로그인한 사람의 기존 접근 권한(RLS) 그대로 적용)해 `pool = activation_request` + 메모 문자열 조건 + 기존 검색어·국가·담당자·상태·회차·날짜 조건을 함께 적용, 정렬·페이지 이동·페이지 크기 유지.
   - 다른 탭으로 이동하면 유입 선택은 적용되지 않음. 선택값은 기존 필터 저장 방식(사용자별 브라우저 저장)에 함께 저장.

## 한계 (DB를 바꾸지 않아서 생기는 부분)
- **상태별 건수 카드**: 건수 함수는 메모 조건을 받을 수 없으므로, 유입 선택 시 카드 숫자는 직접 조회로 계산합니다(해당 유입 건수가 적어 가능). 단, 수천 건 규모가 되면 느려질 수 있습니다.
- **담당자 이름 검색**: 기존 함수는 검색어로 담당자 이름도 찾습니다. 직접 조회에서는 담당자 이름을 직원 목록에서 ID로 바꿔 같은 효과를 내지만, 결과가 기존과 미세하게 다를 수 있습니다(이름·전화번호 검색은 동일).
- **"통화 완료" 상태 묶음, 회차 필터**: 기존 함수와 같은 규칙을 화면 쪽에서 재현합니다. 재현이 정확하지 않은 조건이 있으면 그 조건은 유입 선택 시 비활성화하고 안내 문구를 표시합니다.
- **메모 의존**: 직원이 메모를 수정해 문구를 지우면 분류에서 빠집니다(데이터 구조 변경 없이 생기는 한계).

## 변경하지 않는 것 (명시)
- DB 스키마·마이그레이션·SQL 함수(`search_customers`, `customer_filtered_status_counts` 포함)·트리거·RLS 정책 변경 없음.
- 데이터 INSERT/UPDATE/DELETE 없음.
- `/api/public/*` 외부 신청 API, 텔레그램·슬랙·구글시트·AWS 관련 코드 수정 없음. 새 패키지 설치 없음.

## 기술 세부사항
수정 파일:
- `src/hooks/use-customers.ts` — `CustomersSearchParams`/`StatusCountsParams`에 선택적 `source?: "all" | "nh_allone" | "hanpass_web"` 추가, 쿼리 키에 포함. `source`가 "all"/없음이면 기존 RPC 경로 그대로. 아니면 `supabase.from("customers").select("*", { count: "exact" })`로 `.eq("pool","activation_request").ilike("notes","%[파트너 신청] NH 올원%")`(또는 한패스 웹) + 기존 필터를 `.or(name/phone ilike)`, `.in("country_id")`, `assigned_to`, `status`, `call_round`, 날짜 범위(`imported_at`), `.order(sortKey).order("id")`, `.range()`로 매핑. 상태 건수는 `select("status")` 결과를 집계.
- `src/lib/customer-source.ts` (신규, 순수 함수) — `getCustomerSource(notes)`와 문자열 상수, 배지/필터가 공유.
- `src/routes/customers.lazy.tsx` — 유입 Select(데스크톱 필터 줄 + `MobileFilters` 안), `renderName`에 배지, 필터 변경 시 page=1, 사용자별 필터 저장에 `source` 추가.
- `src/locales/ko` / `en` — "유입", "농협", "농협 올원", "한패스 웹", 한계 안내 문구 키 추가.
- 테스트: `src/lib/customer-source.test.ts` — NH 올원/한패스 웹/기타 메모 분류 3건.
- `AGENTS.md` — 유입 필터는 클라이언트 RLS 조회 경로를 쓰며 "전체"는 기존 RPC 유지라는 규칙 1줄.
