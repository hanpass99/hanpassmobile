# Security architecture

- Broadcast delivery uses a database-owned exclusive claim and per-recipient checkpoints; uncertain sends retain their claim and legacy campaigns without checkpoints cannot resume, preventing duplicate delivery.

- Authenticated business access requires the database approval helper in addition to existing row scopes; this preserves approved staff scopes while blocking pending and disabled sessions.
- Staff activation and creation use authenticated server functions with approved-admin checks before privileged auth operations; client metadata never establishes privilege.
- Global server-function middleware verifies approval for bearer-authenticated calls before privileged handlers execute; database RPCs that bypass RLS enforce the same gate.
- Country access is granted transactionally by a profile approval trigger, not self-signup metadata; requested countries remain profile-only until approval.
- Password reset state is enforced from trusted app metadata by the database approval helper; a bearer-verified password-only endpoint replaces the password and clears flags atomically so editable user metadata cannot bypass access restrictions.
- Telegram inbound insertion is the retry claim before replies and chat mutations; existing unique message identities prevent concurrent duplicate side effects.
- Call ingestion queries indexed generated full normalized phone keys with a two-result ambiguity check; shared normalization tests keep database and request matching aligned.

# Presentation architecture

- Company-specific customer-tab visibility uses a shared pure predicate and the existing visible-pool list, so tab restoration and form options stay consistent without changing database access.

- Interface copy uses matching ko/en locale entries and reactive React rendering; never translate stored business identifiers or outgoing message content, to preserve data behavior.
- Language changes update document metadata without rerunning business loaders; automatic DOM/AI translation is not mounted, to keep customer data unchanged.
- Charts reference global semantic chart/status tokens; the palette lives in global CSS so both themes remain consistent.
- Dashboard presentation calculations live in a shared pure module; both current and previous KPIs use status counts rather than the legacy RPC call-round field so the existing customer-status rule stays consistent without backend changes.
- Customer workflow preferences use user-scoped browser storage with URL-filter precedence and hydration-safe restoration; quick status actions confirm before the existing RPC because status transitions can mutate assignment and activation fields.
- Customer SMS shortcuts use a one-time user-scoped session-storage handoff into the existing manual receiver flow, keeping phone numbers out of URLs and leaving sending permissions unchanged.

- Mobile layouts share a hydration-safe MobileFilters wrapper and mobile-scoped control/overlay/table CSS; desktop markup and page-owned filter state remain unchanged.

# Performance architecture

- Sheet auto-sync runs only while the browser tab is visible, never overlaps itself, and the server takes a database claim (`claim_sync_job`) so each sheet is synced at most once per 20 seconds across all staff; without the claim function it falls back to running every time.
- Sync dedupe lists are read page by page past the 1,000-row API limit, so existing customers are never re-inserted.
- Auth state shows the full-screen loading gate only for the first profile load of a user; token refreshes and tab refocus keep the app mounted, and the context value is memoized.
- Realtime customer changes are batched into one cache write per 0.5 seconds; SLA, sidebar unread and call-log refetches are debounced.
- Telegram reply-lock countdowns tick only inside the small component that shows them and only while a lock is active.
- The Excel library is loaded on demand when importing or exporting.
- Customer search uses trigram indexes; the assignee-name match uses `= ANY (ARRAY(...))` so the planner can combine indexes.
- Telegram realtime events patch the cached chat list and open conversation directly; only a chat outside the loaded 200 or an insert/delete triggers a refetch.
- Call-round statistics rely on the (staff_id, customer_id, call_date) unique index: count rows with non-null staff_id and call_date instead of string DISTINCT or DISTINCT ON sorting.
- `search_customers` picks the visible page first (ordered by the sort key, then id) and converts only those rows to JSON; the id tie-breaker keeps paging stable when many rows share a timestamp.
- Only the Korean locale ships in the first bundle; switch languages through `setInterfaceLanguage`, which loads English on demand before changing.
- The customer search box keeps keystrokes local (`DebouncedSearchInput`) and commits to the page after 250 ms.
