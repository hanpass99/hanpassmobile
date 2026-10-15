# Current requests

- [x] 대출자 명단 메뉴 (국적 2자리, 국가별 보기, 전체 직원)
- [x] USIM 바로가기 버튼을 상단 파란 헤더 우측으로 이동
- [x] 글꼴/크기를 hanpassusim.lovable.app/agency-activation 과 동일하게
- [x] USIM 개통 버튼을 고객 관리(참조 이미지)와 같은 위치·형태(테두리+아이콘)로
- [x] 고객 관리 상태 집계 박스 크기 축소 (작게)
- [x] 탭 이름 변경: 구글폼 개통 신청자→페이스북 신청자, 개통 신청자→한패스앱 신청자

# Mobile UI audit

- [ ] Audit every sidebar menu screen at 440px mobile width
- [ ] Fix shared mobile header, page title, actions, and floating assistant behavior
- [ ] Fix customer tabs, controls, status cards, and tables on mobile
- [ ] Fix staff management list and controls on mobile
- [ ] Fix remaining dashboard, messaging, analytics, settings, and admin screens
- [ ] Verify key screens at mobile and desktop widths

# Partner application API (external HANPASS site)

Append-only design: no new tables. The ledger/payload/idempotency/failed cases
stay in the partner's encrypted store (Railway); `public.customers` only gets
the operational copy of a new application.

- [x] Contract + derivation module (`src/lib/partner-api.ts`): UUIDv4 external id,
      UUIDv8 derived customer id, notes marker, hash normalization, status map
- [x] POST/GET routes rewritten to customers SELECT + single INSERT, fail-closed
- [x] Unit + mock tests (`tests/`, 48 passing) — simulation only, not a DB proof
- [x] `docs/PARTNER-API.md`
- [x] `docs/sql/partner-applications-draft.sql` marked OBSOLETE — never run
- [ ] Register secrets `PARTNER_API_ENABLED` / `PARTNER_API_KEYS` (needs approval)
- [x] Nationality: CIS mapping + 422 unsupported_nationality for new rows (replay unaffected)
- [ ] Per-partner rate limiter (durable counter)
- [ ] Publish + end-to-end verification against the real database (needs approval)
