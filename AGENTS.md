# Security architecture

- Authenticated business access requires the database approval helper in addition to existing row scopes; this preserves approved staff scopes while blocking pending and disabled sessions.
- Staff activation and creation use authenticated server functions with approved-admin checks before privileged auth operations; client metadata never establishes privilege.
- Global server-function middleware verifies approval for bearer-authenticated calls before privileged handlers execute; database RPCs that bypass RLS enforce the same gate.
- Country access is granted transactionally by a profile approval trigger, not self-signup metadata; requested countries remain profile-only until approval.
- Password reset state is enforced from trusted app metadata by the database approval helper; a bearer-verified password-only endpoint replaces the password and clears flags atomically so editable user metadata cannot bypass access restrictions.
- Telegram inbound insertion is the retry claim before replies and chat mutations; existing unique message identities prevent concurrent duplicate side effects.
- Call ingestion queries indexed generated full normalized phone keys with a two-result ambiguity check; shared normalization tests keep database and request matching aligned.