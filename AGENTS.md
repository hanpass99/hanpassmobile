# Security architecture

- Authenticated business access requires the database approval helper in addition to existing row scopes; this preserves approved staff scopes while blocking pending and disabled sessions.
- Staff activation and creation use authenticated server functions with approved-admin checks before privileged auth operations; client metadata never establishes privilege.
- Country access is granted transactionally by a profile approval trigger, not self-signup metadata; requested countries remain profile-only until approval.