# Mobile UI audit

- [ ] Audit every sidebar menu screen at 440px mobile width
- [ ] Fix shared mobile header, page title, actions, and floating assistant behavior
- [ ] Fix customer tabs, controls, status cards, and tables on mobile
- [ ] Fix staff management list and controls on mobile
- [ ] Fix remaining dashboard, messaging, analytics, settings, and admin screens
- [ ] Verify key screens at mobile and desktop widths

# Partner application API (external HANPASS site)

- [x] Contract + validation module (`src/lib/partner-api.ts`)
- [x] POST/GET public routes, fail-closed behind `PARTNER_API_ENABLED`
- [x] Draft SQL in `docs/sql/partner-applications-draft.sql` (NOT applied)
- [x] Unit + mock integration tests (`tests/`)
- [x] `docs/PARTNER-API.md`
- [ ] Independent test project/database (blocked: preview and production share one backend)
- [ ] Apply draft SQL in the test database (blocked: needs the test project)
- [ ] Register test/production keys (blocked: explicit approval required)
- [ ] Per-partner rate limiter (durable counter)
- [ ] Back-office view of per-application product/locale/source/status, behind the disabled flag
- [ ] End-to-end verification against real PostgreSQL, then production enable
