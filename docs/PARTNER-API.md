# Partner Application API (DRAFT — not active)

Integration for the external HANPASS product application site.
Status: **code draft only.** No database object exists yet, no key is
configured, nothing is published. Both endpoints answer `503
integration_disabled` until they are explicitly enabled.

The partner site owns the product ledger. This back office stores no product
master and performs no price lookup; prices arrive already validated by the
partner and are kept verbatim as a per-application snapshot.

---

## 1. Enabling (fail-closed)

| Server environment variable | Meaning |
|---|---|
| `PARTNER_API_ENABLED` | Must be exactly `true`. Any other value (unset, empty, `TRUE`, `1`) keeps the integration off. |
| `PARTNER_API_KEYS` | `partnerId:key,partnerId:key`. Set on the server only — never sent in chat, never committed. |

Order of checks in every request: feature flag → API key → idempotency key →
body size → schema. **No database module is imported until the flag and key
both pass**, so a disabled deployment can neither read nor write data.

Base URLs are assigned per environment and are not invented in this document;
they are handed over together with the keys at activation time.

---

## 2. `POST /api/public/applications`

Headers

| Header | Required | Notes |
|---|---|---|
| `X-API-Key` | yes | Server-to-server key; identifies the partner |
| `Idempotency-Key` | yes | ≤ 120 chars, unique per logical application attempt |
| `Content-Type` | yes | `application/json` |

Body (camelCase, ≤ 16 KB)

```json
{
  "externalApplicationId": "hp-20260921-0001",
  "source": "nh_allone",
  "locale": "mn",
  "applicant": {
    "firstName": "Bat",
    "middleName": null,
    "lastName": "Erdene",
    "phone": "010-1234-5678",
    "nationality": "MN"
  },
  "product": {
    "code": "sk-light49",
    "type": "sim",
    "name": "SK Light 49",
    "carrier": "SKT",
    "monthlyFee": 26750,
    "deviceModel": null,
    "devicePrice": null,
    "contractMonths": 12,
    "bundledPlanCode": null,
    "currency": "KRW"
  },
  "consent": { "accepted": true, "version": "privacy-v3", "acceptedAt": "2026-09-21T07:00:00Z" },
  "submittedAt": "2026-09-21T07:00:05Z"
}
```

Field rules

- `source`: `nh_allone` | `hanpass_web`
- `locale`: one of 14 — `ko, en, zh, vi, ru, ne, km, id, my, th, mn, si, ja, lo`
- `applicant.nationality`: ISO 3166-1 **alpha-2**, uppercase (`MN`, `VN`, `KR`)
- `product.code`: partner code, e.g. `sk-light49`, `lg-hanpass7`, `bundle-a175`
- `product.type`: `sim` | `bundle`. Device fields are allowed only for `bundle`
- Money (`monthlyFee`, `devicePrice`): integer KRW, 0 … 100,000,000, or `null`.
  **`null` means "not applicable / not provided"; `0` means genuinely free.**
  The two are stored and returned distinctly and are never collapsed
- `currency`: `KRW`
- `consent.accepted` must be `true`, otherwise `400`

Bundle example (free device):

```json
"product": {
  "code": "bundle-a175", "type": "bundle", "name": "Bundle A17 5G", "carrier": "LGU+",
  "monthlyFee": 33000, "deviceModel": "Galaxy A17 5G", "devicePrice": 0,
  "contractMonths": 24, "bundledPlanCode": "lg-hanpass7", "currency": "KRW"
}
```

Success — `201` (new) / `200` (replay)

```json
{
  "applicationId": "…",
  "externalApplicationId": "hp-20260921-0001",
  "result": "created",
  "status": "received",
  "receivedAt": "2026-09-21T07:00:06Z",
  "requestId": "req_…"
}
```

`result`: `created` | `replayed`. Nothing else is returned — no applicant
data, no internal notes, no customer record.

Errors

| Status | `error` | Cause |
|---|---|---|
| 400 | `idempotency_key_required` | header missing or too long |
| 400 | `invalid_json` / `invalid_payload` | malformed body / schema failure (field paths + rule messages only, never submitted values) |
| 401 | `unauthorized` | missing or unknown key |
| 409 | `idempotency_key_conflict` | same key, different content |
| 409 | `external_application_id_conflict` | same `externalApplicationId`, different content |
| 413 | `payload_too_large` | body over 16 KB |
| 503 | `integration_disabled` | feature flag not `true` |
| 500 | `internal_error` | unexpected failure (correlate via `requestId`) |

---

## 3. `GET /api/public/applications/{externalApplicationId}`

Header: `X-API-Key`. Results are **partner-scoped** — another partner's
application answers `404`, so existence is never revealed.

```json
{
  "applicationId": "…",
  "externalApplicationId": "hp-20260921-0001",
  "status": "processing",
  "receivedAt": "2026-09-21T07:00:06Z",
  "requestId": "req_…"
}
```

`status` is the **application's own** status (`received`, `needs_review`,
`in_progress`, `activated`, `rejected`, `cancelled`). A returning customer's
earlier activation never leaks into a new application's status. No applicant
name, phone, memo or other internal field is ever returned.

---

## 4. Idempotency, duplicates and customer linking

- Idempotency is keyed on `(partnerId, idempotencyKey)` plus a SHA-256 hash of
  the canonicalized payload. Same key + same content → `replayed`; same key +
  different content → `409`.
- `(partnerId, externalApplicationId)` is unique as well.
- The existing customer duplicate index (name + phone + application date) is
  **not** used for idempotency — relying on it would silently drop a second,
  different product application from the same person on the same day.
- Customer linking is strict: normalized full name **and** phone **and** the
  activation-request pool must match exactly one existing customer. One match →
  link (no existing field is ever overwritten). No match → create. Several
  matches → do not guess: the application is stored with status
  `needs_review` for manual confirmation. A phone-only match never merges.
- Every application is its own row, including repeat applications from an
  existing customer, so each product snapshot is preserved.
- Concurrency is settled by database unique constraints inside a single
  transaction (see `docs/sql/partner-applications-draft.sql`).

## 5. Assignment

No automatic assignment. Applications are stored successfully and left
**unassigned**; operators assign them in the back office. There is no approved
assignment policy, so none is implemented.

Questions to settle before any auto-assignment is added:
1. Which staff pool (company / department) receives partner applications?
2. Method: round-robin, nationality/language ownership, workload balancing, or
   shift-based?
3. Should applicant nationality map to staff country assignments?
4. Are there cases that must stay unassigned for review?
5. For a repeat customer, should the previous owner be reused?

## 6. Rate limiting (design)

Not yet implemented — the serverless runtime has no shared memory, so a
durable counter is required. Intended design: per-partner token bucket keyed on
`partnerId` in the database (e.g. 60 requests/minute sustained, short burst
allowance), plus the 16 KB body cap that is already enforced. Exceeding the
budget answers `429` with a `Retry-After` header. To be added together with the
first activation.

## 7. Logging and privacy

Only a `requestId`, an outcome code and the SHA-256 `requestHash` are recorded.
Raw request bodies, API keys and applicant personal data are never logged or
stored as free text.

## 8. Rollback

Rollback means **disabling the feature**: unset `PARTNER_API_ENABLED` or remove
the partner key, and both endpoints return `503` / `401` again. The application
ledger is **retained, never dropped**, so accepted applications remain
auditable. No claim is made about how quickly a configuration change propagates
— that is measured at activation time, not promised here.

## 9. Remaining work before end-to-end integration

1. Create an independent test project/database (the preview and production
   apps currently share one backend, so there is no isolated test data today).
2. Apply `docs/sql/partner-applications-draft.sql` there (it is deliberately
   outside `supabase/migrations/`, so nothing is applied automatically).
3. Register test keys in the server environment of that project.
4. Run end-to-end checks: created / replayed / 409 / status lookup /
   needs_review / concurrent duplicates against real PostgreSQL.
5. Implement the rate limiter and the back-office view of per-application
   product, locale, source and status (behind the same disabled flag).
6. Only then register production keys and enable production.
