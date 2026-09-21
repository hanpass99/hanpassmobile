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
- [ ] Per-partner rate limiter (durable counter)
- [ ] Publish + end-to-end verification against the real database (needs approval)
