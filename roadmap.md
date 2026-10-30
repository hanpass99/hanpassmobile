# Current requests

- [x] Staff creation: confirmed existing disabled duplicate-email account; actionable localized errors and new-account-only cleanup; 21 tests and build passed (staff route retains 6 existing lint errors)
- [ ] Staff creation: authenticated verification requires a signed-in requesting account

- [x] Broadcast: shorten requests, timeout Telegram calls, persist each recipient, serialize delivery and offer safe resume for new campaigns; legacy campaigns remain blocked to prevent duplicates
- [x] Broadcast: checkpoint/timeout/block/rate-limit regression tests, changed-function and route lint, automatic type-check/build passed
- [ ] Broadcast: real authenticated sending verification (requesting account session unavailable); earlier campaign cannot safely resume because recipient checkpoints were never recorded; publish required for new delivery method

- [x] UX batch 3: customer tables, per-user filter/tab/page-size restoration, chips and reset
- [x] UX batch 3: call/SMS/status quick actions, safe confirmation and row keyboard navigation
- [x] UX batch 3: consistent loading/empty/error states; 118 regression tests, automatic type-check/build and desktop/mobile simulated workflows passed
- [ ] UX batch 3: changed-file lint is blocked by 12 existing customer-file errors; other changed files pass. Real staff verification requires preview sign-in (self-session mint found no matching account).

- [x] UX batch 2: equal-period KPI comparisons using existing RPC/filters and one call-completed definition
- [x] UX batch 2: searchable top-10 staff ranking, country bars with others, and date presets
- [x] UX batch 2: dashboard changed-file lint, 114 regression tests, automatic type-check/build, and desktop/mobile mock browser verification
- [ ] UX batch 2: real staff dashboard verification requires preview sign-in (self-session mint found no matching account); incidental pre-existing channel chart duplicate attribute fixed, channel lint still has existing any/dependency debt

- [x] UX batch 1: Korean/English locale coverage and matching-key verification; preserve Korean copy and all behavior
- [x] UX batch 1: real Hanpass logo in sidebar and login
- [x] UX batch 1: semantic chart palette in light and dark themes
- [x] UX batch 1: 101 regression tests, new translation-module lint, automatic type-check/build and mock/public browser checks
- [ ] UX batch 1: full-project lint remains blocked by pre-existing formatting/type lint debt; real staff session verification needs preview sign-in

- [x] Medium security: unique temporary reset passwords and enforced password change
- [x] Medium security: Telegram inbound deduplication and correct timezone sessions
- [x] Medium security: indexed exact call matching, ambiguity handling, constant-time token check
- [x] Medium security: official SheetJS upgrade and Excel compatibility tests
- [x] Medium security: regression tests, isolated PostgreSQL policies, type-check and preview build
- [ ] Medium security: publish app changes before staff resets; real authenticated reset verification needs preview sign-in

- [x] Critical security: approval gate on all authenticated public/storage access; trusted signup metadata and approval country grant
- [x] Critical security: auth bans on disable, admin-only AI settings writes, no UI text changes
- [x] Critical security: isolated PostgreSQL signup/RLS tests; live 104 approved profiles/roles verified unchanged
- [ ] Critical security: live authenticated signup→approval→disable UI verification (requesting user has no managed auth account; needs preview sign-in)

- [x] 대출자 목록을 다른 고객 탭과 같은 집계·필터·표·페이지 구성으로 정리

- [x] 대출자 명단 메뉴 (국적 2자리, 국가별 보기, 전체 직원)
- [x] USIM 바로가기 버튼을 상단 파란 헤더 우측으로 이동
- [x] 글꼴/크기를 hanpassusim.lovable.app/agency-activation 과 동일하게
- [x] USIM 개통 버튼을 고객 관리(참조 이미지)와 같은 위치·형태(테두리+아이콘)로
- [x] 고객 관리 상태 집계 박스 크기 축소 (작게)
- [x] 탭 이름 변경: 구글폼 개통 신청자→페이스북 신청자, 개통 신청자→한패스앱 신청자
- [x] 대출자 명단을 사이드바 메뉴 → 고객 관리 탭으로 이동 (/loans 삭제)

# Mobile UI audit

- [x] Audit every sidebar menu screen for admin, staff, Hanpass at 390px and 440px (role simulation; unavailable screens retain existing access guards)
- [x] Fix shared mobile header, page title, actions, and floating assistant behavior
- [x] Fix customer tabs, controls, status cards, and tables on mobile
- [x] Fix staff management list and controls on mobile
- [x] Fix remaining dashboard, messaging, analytics, settings, and admin screens
- [x] Verify key screens at mobile and desktop widths: populated simulated screens, all customer tabs, Telegram list/back, public login/reset and forced-password screen; 118 regression tests and automatic type-check/build passed
- [ ] Real-account mobile verification requires preview sign-in; no managed auth account matches the requesting user.
- [ ] Changed-file lint remains blocked by 24 pre-existing errors in legacy route files; shared mobile components have no lint errors.

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
- [x] 상단 '고객 관리' 제목 자리를 USIM 개통 링크로 교체, 오른쪽 USIM 버튼 삭제
- [x] 대출자 목록도 시작일만 선택 시 하루치 조회
