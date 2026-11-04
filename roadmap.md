# Current requests

- [x] Telegram false blocked classification: explicit recipient errors only across reply/media/broadcast; fresh private inbound messages clear older evidence after the insertion claim; existing flagged chats have an explicit retry control. 42 targeted tests passed and automatic build OK.
- [ ] Telegram real-account retry/delivery verification: blocked by missing requesting-user preview session; no live customer message sent and no historical block flags bulk-cleared.

- [ ] AWS AI auto-reply: all server AI routes through the Lovable AI gateway, which the AWS copy cannot use; added a direct-provider fallback (GEMINI_API_KEY/OPENAI_API_KEY env keys, AI_CHAT_MODEL/AI_EMBEDDING_MODEL overrides) in ai-gateway.server.ts used by ai-reply, ai-learn, auto-translate and the in-app assistant; type-check and 154 tests passed. Next: user prepares Gemini + OpenAI keys; ai-keys-aws-setup.sh saves the keys, deploys the code, restarts and re-runs the AWS receive/auto-reply test.
- [ ] AWS Telegram migration: bot token stored in app-server.env and verified via getMe (@hanpassmobile_bot, 운영과 동일 봇); getWebhookInfo shows NO registered webhook (url:"") and 0 pending updates — production inbound is not webhook-based, so its delivery mechanism must be identified before any setWebhook (setWebhook would break production if it polls getUpdates). App restarted (active). Next: safe outbound sendMessage test, then inbound decision after production mechanism confirmed. No setWebhook until final reconciliation + explicit cutover approval.
- [x] AWS Google Sheets migration: own-account OAuth (방법 B) completed — Desktop OAuth client created, refresh token stored in `app-server.env`, patched sync file deployed, all 5 sheet jobs read successfully via sheets.googleapis.com (2026-11-03 05:33 UTC manual + 06:03/06:04 UTC auto-sync at 1-min intervals confirmed in sync_job_runs, 0 errors). Production Lovable gateway path untouched. Earlier app.log error stacks were browser-aborted requests, not sheet failures.

- [x] AWS Slack test DM to jskkiller@hanpass.com: recipient param built and deployed; same-day log blocked the automated send (`sent:false`), so a one-off direct DM was sent and the user confirmed receipt. Automated path already verified (`sent:true` for asirojiddin123). Temp read on migration-transfer bucket closed. Slack integration on AWS test server: done.

- [x] AWS migration: staff domain connected — Elastic IP 52.78.241.202, Gabia A record ob.hanpassmobile.co.kr, security group 80/443, nginx+HTTPS cert issued, app rebuilt for domain (API 401 expected, app 200), user logged in successfully.


- [x] Slack daily applicant report: Hanpass Mobile Bot DM at 08:00 KST for previous-day activation-request applicants (신청/개통완료/미처리/월누적); test DM to asirojiddin123@hanpass.com sent and verified; pg_cron job registered (23:00 UTC); requires publish for the scheduled call to reach the deployed route.

- [x] AWS connection access: explain how connection Owner grants project Owner Can use access; user action required before migration inspection.
- [ ] AWS migration: inspect existing AWS destination (blocked by AWS connection/access); keep current production untouched.
- [ ] AWS migration: obtain official full database/auth export and separate storage files; inventory code and external integrations.
- [ ] AWS migration: prepare isolated copy with outbound sends/sync disabled, validate accounts/permissions/data/files/integrations.
- [x] AWS migration: user confirmed the exposed test database password was rotated before continuing.
- [x] AWS cutover 2026-11-04: user reported v5 COMMIT and AWS Telegram webhook / Slack cron URL changes. At the user's explicit request, Lovable Cloud was paused without deleting data; the pause tool confirmed success. No AWS or SMS relay changes were made.
- [ ] AWS post-cutover verification: user confirmed customer lookup/edit works at 05:39 UTC but reports no bot message; distinguish absent auto-reply (deferred) from missing inbound in AWS chat, and obtain read-only getWebhookInfo diagnostics from AWS. Call ingestion, Google Sheets sync, and SMS delivery still need confirmation. Last comparison before pause: 7/9 table counts matched; AWS rounds 13,182 vs old 13,185 (old rows still arriving at 05:34 UTC), AWS history 41,900 vs old 41,898. Differences remain unreconciled; old data is preserved, and further source queries require explicitly authorized resume. AI auto-reply remains deferred to post-migration setup.

- [x] Customer status counts: shared filter scope and authenticated PH verification; PH 미처리 0 matches empty list, all countries 미처리 82 matches 82 total; 14 regression tests and build passed.
- [x] Customer nationality and assigned-country selectors: same 38 countries with actual visible customers, verified with the requesting session; unused countries excluded without changing customer data or permissions.

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

- [x] 시험 앱 PC 접속: SSH 터널(4173/8000) 연결 후 localhost:4173 확인
- [x] 시험 앱 기능 확인: 로그인·대시보드·고객 목록·파일 열기 정상 (사용자 확인)
- [x] 시험 앱 서버 기능: 직원 생성 성공 — 원인은 시험 auth 버전이 created_by_admin 표시를 지연 적용하는 것. 시험 DB에 approve_admin_created_staff 트리거(승인+활성 동시 설정) 추가로 해결. 최종 전환 시에도 동일 적용 필요
- [x] 시험 앱 실시간: 실시간 채팅 갱신 정상 (게시 표 9개 운영과 동일, 사용자 확인)
- [x] AWS 전환 전: 서버 기능 3개(admin-delete-staff, admin-reset-staff-password, admin-list-staff-activity) 시험 서버 이전 — 삭제 성공 확인
- [x] 시험 백업복구: pg_dump(Fc) 15MB 백업 → restore_test 임시 DB 복원 성공, 건수 일치 확인(고객 26,219/프로필 108/계정 107). supabase_admin 계정으로 복원, pg_cron 제외 목록 사용. 백업 파일 보관 중(~/hanpass-test/backups, 권한 700/600)
- [x] 최종 데이터 동기화: 최신 export(09:49 UTC 복원)로 고객 26,902 / 프로필 107 / 계정 106 운영과 일치. 복원 오류 16건은 storage·extension·realtime 내부 구조 충돌뿐(업무 표 0건). 직원 조회 권한 40/40 운영과 일치(과다 2개 회수 완료). 파일 DB 목록 750 = 실제 파일 750, 누락 6장 채팅 사진 업로드 완료(200), 로그인·채팅 사진 열림 사용자 확인 완료. 남은: 전환 직전 최종 증분 동기화(복원 시점 이후 신규 데이터) + 슬랙 pg_cron 호출 URL을 ob.hanpassmobile.co.kr로 변경
- [x] 전환 일정: 사용자 요청으로 즉시 전환 준비 시작 승인(최종 검증·데이터 동기화 전 운영 중지 아님)
- [x] AWS 공개 접속 준비: 도메인·HTTPS 완료(ob.hanpassmobile.co.kr). systemd hanpass-app + docker/nginx enable 적용, 서버 reboot(09:45:20) 후 3개 서비스 active·앱 응답 200 확인
- [x] AWS nginx configuration: user confirmed active /api/public/ → app 4173 rule; unauthenticated Slack/Telegram requests return 401. Authenticated external integration flows remain separately unverified.
- [ ] 외부 연동 전환 검증: 텔레그램 수신·발신, 구글 시트, 문자 중계, 외부 신청 API 등 사용 연동 목록과 단일 처리 전환 순서 확인 — 텔레그램·구글시트·슬랙 검증 완료, 외부 신청 API는 활성화+검증 스크립트(/mnt/documents/partner-api-setup-test.sh) 안내 완료, 사용자 실행 결과 대기
- [ ] 최종 복구 준비: 예약 작업·권한 포함 복구 절차와 최신 파일 백업 확인 — 현재 임시 복원은 pg_cron/소유권/권한 제외 및 3개 표 건수만 확인
- [ ] 최종 전환: 위 검증 후 쓰기·자동 유입 통제, 최신 전체 데이터/계정/파일 동기화 및 대조, AWS 단독 전환 확인 후 구 운영 중지(원본 보존, 문자 서버 유지)

- [ ] 직원 생성 실패 시 빈 프로필이 남는 문제(운영 동일) 정리 여부 결정
- [ ] AWS 단독 전환 실행: 최종 증분 데이터 반영(백업 2026-11-04 03:37 UTC 이후 변경분, 지금 시각 기준) → 텔레그램 웹훅·슬랙 예약 URL을 ob.hanpassmobile.co.kr로 전환 → 검증 후 기존 운영 중지(데이터 보존, 문자 서버 유지)
